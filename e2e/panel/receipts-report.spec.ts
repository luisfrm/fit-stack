import { test, expect, type ApiClient } from '../fixtures';
import type { Download } from '@playwright/test';
import { uid, uniqueEmail } from '../helpers/api';
import { TEST_ORG } from '../helpers/test-tenant';
import { addLocalDays, toLocalDayString } from '@workspace/shared';
import { readFileSync } from 'node:fs';

// Sin jobs-worker en E2E: lo validado queda numerado con PDF pendiente.
// Los filtros viven en la URL: se prueban navegando con query params
// (determinista, sin depender del select custom).
test.describe('Panel — Reporte de comprobantes', () => {
  async function createSubscription(
    panelApi: ApiClient,
    status: 'validated' | 'processing',
  ) {
    const email = uniqueEmail('report');
    const uidSuffix = uid();
    const lastName = `Reporte ${uidSuffix}`;
    const tz = TEST_ORG.timezone;
    const today = toLocalDayString(tz);
    const plan = await panelApi.create<{ id: number }>('plan', '/api/plans', {
      name: `Plan Reporte ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      features: ['Acceso'],
      isPopular: false,
      isActive: true,
      isVisibleOnSite: true,
    });
    const member = await panelApi.create<{ id: number }>('member', '/api/members', {
      firstName: 'Reporte',
      lastName,
      email,
      role: 'member',
      isActive: true,
      sendInvite: false,
    });
    await panelApi.create('subscription', '/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: today,
      endDate: addLocalDays(tz, today, 30),
      payment: {
        amountPaid: 5000,
        currencyPaid: 'USD',
        paymentMethod: 'transferencia',
        paymentMethodDetails: [],
        status,
        paymentDate: today,
      },
    });
    return { email, lastName, uidSuffix, today };
  }

  test('muestra el correlativo con estado y resumen', async ({ page, panelApi }) => {
    const { lastName } = await createSubscription(panelApi, 'validated');

    await page.goto('/reports/receipts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/e2e-suite-\d{4}-\d+/).first()).toBeVisible({
      timeout: 30_000,
    });
    // Sin consumer: numerado con PDF pendiente (nunca UUID).
    await expect(page.getByText('PDF pendiente').first()).toBeVisible();
    await expect(page.getByText(lastName).first()).toBeVisible();
    await expect(page.getByText('Operación #')).toHaveCount(0);
  });

  test('filtra por rango de fechas', async ({ page, panelApi }) => {
    const { today } = await createSubscription(panelApi, 'validated');

    await page.goto(`/reports/receipts?from=${today}&to=${today}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/e2e-suite-\d{4}-\d+/).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/reports/receipts?from=2000-01-01&to=2000-01-02', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Sin comprobantes para los filtros indicados.')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('filtra anulados (vacío) y exporta CSV con el correlativo', async ({
    page,
    panelApi,
  }) => {
    await createSubscription(panelApi, 'validated');

    await page.goto('/reports/receipts?status=voided', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sin comprobantes para los filtros indicados.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/reports/receipts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/e2e-suite-\d{4}-\d+/).first()).toBeVisible({
      timeout: 30_000,
    });
    // Reintento: si el clic cae antes de la hidratación del cliente,
    // el onClick no corre y no hay download (misma race que modal.ts).
    let download: Download | null = null;
    for (let attempt = 0; attempt < 3 && !download; attempt++) {
      const downloadPromise = page
        .waitForEvent('download', { timeout: 15_000 })
        .catch(() => null);
      await page.getByRole('button', { name: 'CSV' }).click();
      download = await downloadPromise;
    }
    expect(download, 'la exportación CSV debe descargar el archivo').toBeTruthy();
    const path = await download.path();
    expect(path).toBeTruthy();
    const content = readFileSync(path!, 'utf8');
    expect(content).toMatch(/comprobante,estado,miembro/);
    expect(content).toMatch(/e2e-suite-\d{4}-\d+/);
  });

  test('validar un pendiente lo refleja en el reporte (invalidación)', async ({
    page,
    panelApi,
  }) => {
    const { email, lastName } = await createSubscription(panelApi, 'processing');

    // Aún sin comprobante: no aparece en el reporte.
    await page.goto('/reports/receipts', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(lastName)).toHaveCount(0);

    // Validar por API (el UI de pendientes está roto en este entorno —
    // falla igual sin estos cambios; aquí se prueba la invalidación).
    const list = await panelApi.get<{ data?: Array<{ memberEmail?: string; paymentId?: number }> }>(
      '/api/subscriptions',
      { status: 'processing', limit: 50 },
    );
    const paymentId =
      list.data?.find((row) => row.memberEmail === email)?.paymentId ?? 0;
    expect(paymentId, 'el fixture processing debe aparecer en el listado').toBeTruthy();
    await panelApi.patch(`/api/payments/${paymentId}/status`, { status: 'validated' });

    // El reporte ya muestra el comprobante numerado (caché invalidada).
    await page.goto('/reports/receipts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/e2e-suite-\d{4}-\d+/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('PDF pendiente').first()).toBeVisible();
  });
});
