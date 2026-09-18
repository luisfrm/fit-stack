/**
 * Reporte de comprobantes SaaS (C4): auditoría del correlativo global `FS-N`.
 *
 * Espejo del reporte del Panel (`reports-receipts.test.ts`) sobre la serie
 * continua de FitStack: clasificación, gaps (hueco vs anulado), totales por
 * moneda, filtros en UTC y RBAC de lectura (support lee, no escribe).
 *
 * Patrón estándar: HTTP real + Neon branch (`TEST_DATABASE_URL`), skip
 * elegante sin la variable, `truncateAll` por archivo.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../jobs-worker/src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
}));

import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
  TEST_DATABASE_URL,
} from '../helpers/db';
import {
  createGymTenant,
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import {
  handlePlatformReceiptRender,
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Platform receipts report (C4)', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('c4');
    plan = await createPlatformPlan();
  });

  async function createPlatformPlan(): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  /** Alta con pago ya validado: el paso 1 numera en la misma request. */
  async function createValidatedPayment(): Promise<Record<string, unknown>> {
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    return rows[0]!;
  }

  function jobsEnv(): ReceiptHandlerEnv {
    const env = admin.client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  function report(query: Record<string, string | number> = {}) {
    return admin.client.get('/api/platform/subscriptions/receipts', { query });
  }

  it('clasifica issued/pending/voided, resume totales y explica anulado vs hueco', async () => {
    // A: emitido de verdad (paso 2 real, PDF en R2).
    const first = await createValidatedPayment();
    const firstNumber = first['receipt_number'] as string;
    const rendered = await handlePlatformReceiptRender(jobsEnv(), {
      type: 'receipt.render',
      scope: 'platform',
      paymentId: Number(first['id']),
      organizationId: tenant.organization.id,
      receiptNumber: firstNumber,
    });
    expect(rendered).toBe('completed');

    // B: numerado y luego ANULADO (conserva número).
    const second = await createValidatedPayment();
    const secondNumber = second['receipt_number'] as string;
    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${second['id']}/status`,
      { status: 'voided' },
    );
    expect(voided.status, voided.text).toBe(200);

    // Salto artificial de secuencia (+5): los intermedios son huecos reales.
    await testQuery(
      `UPDATE platform_document_sequence SET next_number = next_number + 5 WHERE document_type = 'receipt'`,
    );

    // C: numerado, PDF pendiente (sin consumer en tests).
    const third = await createValidatedPayment();
    const thirdNumber = third['receipt_number'] as string;

    const all = await report({ status: 'all' });
    expect(all.status, all.text).toBe(200);
    const allBody = all.body as {
      rows: Array<{ state: string; receiptNumber: string | null }>;
      summary: { issued: number; pending: number; voided: number; preSystem: number };
      totals: Array<{ currency: string; amount: number }>;
      gaps: unknown[];
    };
    expect(allBody.rows.map((r) => r.state).sort()).toEqual([
      'issued',
      'pending',
      'voided',
    ]);
    expect(allBody.summary).toEqual({ issued: 1, pending: 1, voided: 1, preSystem: 0 });
    // Totales solo sobre emitidos no anulados: A + C (B queda fuera).
    expect(allBody.totals).toEqual([
      expect.objectContaining({ currency: 'USD', amount: 10000 }),
    ]);
    // `status=all` incluye la auditoría del correlativo.
    expect((allBody.gaps as Array<{ kind: string }>).length).toBeGreaterThan(0);

    const gapsRes = await report({ status: 'gaps' });
    expect(gapsRes.status, gapsRes.text).toBe(200);
    const gapsBody = gapsRes.body as {
      rows: unknown[];
      gaps: Array<{ kind: string; seq: number; receiptNumber: string }>;
    };
    expect(gapsBody.rows).toEqual([]);

    const anulados = gapsBody.gaps.filter((g) => g.kind === 'anulado');
    const huecos = gapsBody.gaps.filter((g) => g.kind === 'hueco');
    expect(anulados).toHaveLength(1);
    expect(anulados[0]).toMatchObject({
      receiptNumber: secondNumber,
      seq: Number(secondNumber.replace('FS-', '')),
    });
    // Los 5 números saltados, entre B y C.
    const secondSeq = Number(secondNumber.replace('FS-', ''));
    expect(huecos.map((g) => g.seq)).toEqual([1, 2, 3, 4, 5].map((n) => secondSeq + n));
    expect(thirdNumber).toBe(`FS-${String(secondSeq + 6).padStart(7, '0')}`);
    // El número humano nunca es el UUID del pago.
    expect(firstNumber).toMatch(/^FS-\d{7,}$/);
  });

  it('filtros: rango en UTC, año de pago, método y validación 400', async () => {
    const payment = await createValidatedPayment();
    const receiptNumber = payment['receipt_number'] as string;
    // 2026-01-02 01:00 UTC: en UTC es ese día (a diferencia del Panel, que
    // filtra por día local de la organización).
    await testQuery(
      `UPDATE platform_subscription_payment
       SET payment_date = $1, receipt_issued_at = $1
       WHERE id = $2`,
      ['2026-01-02T01:00:00.000Z', Number(payment['id'])],
    );

    const inRange = await report({ from: '2026-01-02', to: '2026-01-02' });
    expect(inRange.status, inRange.text).toBe(200);
    expect(
      (inRange.body as { rows: Array<{ receiptNumber: string }> }).rows.map(
        (r) => r.receiptNumber,
      ),
    ).toContain(receiptNumber);

    const dayBefore = await report({ from: '2026-01-01', to: '2026-01-01' });
    expect(dayBefore.status, dayBefore.text).toBe(200);
    expect((dayBefore.body as { rows: unknown[] }).rows).toEqual([]);

    // `year` = año UTC de `payment_date` (la serie FS-N no lleva año).
    await testQuery(
      `UPDATE platform_subscription_payment SET payment_date = $1 WHERE id = $2`,
      ['2025-12-31T23:00:00.000Z', Number(payment['id'])],
    );
    const year2025 = await report({ year: 2025 });
    expect(year2025.status, year2025.text).toBe(200);
    const year2025Rows = (year2025.body as { rows: Array<{ receiptNumber: string }> }).rows;
    expect(year2025Rows.map((r) => r.receiptNumber)).toEqual([receiptNumber]);

    const byMethod = await report({ method: 'zelle' });
    expect(byMethod.status, byMethod.text).toBe(200);
    expect(
      (byMethod.body as { rows: Array<{ receiptNumber: string }> }).rows.map(
        (r) => r.receiptNumber,
      ),
    ).toContain(receiptNumber);

    const otherMethod = await report({ method: 'efectivo' });
    expect(otherMethod.status, otherMethod.text).toBe(200);
    expect((otherMethod.body as { rows: unknown[] }).rows).toEqual([]);

    const badStatus = await report({ status: 'bogus' });
    expect(badStatus.status, badStatus.text).toBe(400);
    expect(badStatus.body).toMatchObject({ code: 'INVALID_REPORT_FILTERS' });

    const bigLimit = await report({ limit: 1001 });
    expect(bigLimit.status, bigLimit.text).toBe(400);

    const badYear = await report({ year: 9999 });
    expect(badYear.status, badYear.text).toBe(400);

    const badDate = await report({ from: '02-01-2026' });
    expect(badDate.status, badDate.text).toBe(400);
  });

  it('RBAC: support LEE el reporte (200) y NO escribe (403)', async () => {
    const support = await registerPlatformUser('support');

    const read = await support.client.get('/api/platform/subscriptions/receipts');
    expect(read.status, read.text).toBe(200);

    const payment = await createValidatedPayment();
    const denied = await support.client.patch(
      `/api/platform/subscriptions/payments/${payment['id']}/status`,
      { status: 'invalid' },
    );
    expect(denied.status, denied.text).toBe(403);
  });
});
