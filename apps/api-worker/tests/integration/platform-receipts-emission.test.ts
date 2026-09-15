/**
 * Platform receipts emission integration tests (C2).
 *
 * Covers: step 1 numbering on approve (number + receipt.render with
 * scope 'platform', taxes persisted, zero emails), step 2 completion via
 * the real jobs-worker handler (R2 + pdf_key + gated email WITH
 * attachment), at-least-once idempotency, sweep covering the platform
 * table, $0 trial SKIP (no number burned), transition guard (re-PATCH
 * does not renumber), cumulative period intact, and RBAC (support 403).
 *
 * The PDF renderer is stubbed (`vi.mock` on jobs-worker's receipt-pdf):
 * render fidelity is covered by jobs-worker's own smoke test; here we
 * assert the step-2 LOGIC. Everything else (DB, queues, R2) is real via
 * spies. Mirror of receipts-emission.test.ts (Panel, Fase 2).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../jobs-worker/src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
}));

import { createClient } from '../helpers/client';
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
import { createDb } from '@workspace/database/factory';
import {
  handlePlatformReceiptRender,
  sweepPendingReceiptPdfs,
  type ReceiptHandlerEnv,
  type SweepEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Platform receipts emission (C2)', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('c2');
    plan = await createPlatformPlan();
  });

  function jobsEnv(client: ReturnType<typeof createClient>): ReceiptHandlerEnv {
    const env = client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  function sweepEnv(client: ReturnType<typeof createClient>): SweepEnv {
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      RECEIPT_QUEUE: client.env['RECEIPT_QUEUE'] as Queue,
    };
  }

  function resetSpies(client: ReturnType<typeof createClient>) {
    client.queue.reset();
    client.receiptQueue.reset();
    client.r2.reset();
  }

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

  /** Platform subscription with a `processing` payment via HTTP. */
  async function createProcessingPayment(): Promise<number> {
    // Resetea spies ANTES del POST: cada test mide solo lo que él produce.
    resetSpies(admin.client);
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(-60),
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(-60),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      // POST retorna el detalle (con `id` de suscripción).
      [res.body.id],
    );
    return Number(rows[0]!.id);
  }

  async function approvePayment(paymentId: number, client = admin.client) {
    return client.patch(`/api/platform/subscriptions/payments/${paymentId}/status`, {
      status: 'validated',
    });
  }

  async function readPayment(paymentId: number): Promise<Record<string, unknown>> {
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    return rows[0]!;
  }

  function renderEvent(payment: Record<string, unknown>, organizationId: string) {
    return {
      type: 'receipt.render' as const,
      scope: 'platform' as const,
      paymentId: Number(payment['id']),
      organizationId,
      receiptNumber: payment['receipt_number'] as string,
    };
  }

  it('T1 paso 1: aprobar numera FS-N + impuestos, encola render, cero emails', async () => {
    const paymentId = await createProcessingPayment();
    resetSpies(admin.client);

    // Legacy/pre-sistema: sin número antes de aprobar.
    expect((await readPayment(paymentId))['receipt_number']).toBeNull();

    const res = await approvePayment(paymentId);
    expect(res.status, res.text).toBe(200);

    const payment = await readPayment(paymentId);
    expect(payment['receipt_number']).toMatch(/^FS-\d{7,}$/);
    // Acoplado al default VE del helper (`createOrganization countryCode VE`):
    // IVA 16% + IGTF 3%: 5000 = 4202 + 798 (672 + 126).
    expect(Number(payment['subtotal'])).toBe(4202);
    expect(Number(payment['tax_total'])).toBe(798);
    const details = payment['tax_details'] as Array<{ name: string; amount: number }>;
    expect(details.map((d) => d.name).sort()).toEqual(['IGTF', 'IVA']);
    expect(details.reduce((s, d) => s + d.amount, 0)).toBe(798);

    const renders = admin.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      scope: 'platform',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber: payment['receipt_number'],
    });
    expect(admin.client.queue.ofType('email.org_payment_received')).toHaveLength(0);
  });

  it('T2 paso 2: completa PDF en R2 y encola el email (gate rowCount===1)', async () => {
    const paymentId = await createProcessingPayment();
    await approvePayment(paymentId);
    const payment = await readPayment(paymentId);
    resetSpies(admin.client);

    const result = await handlePlatformReceiptRender(
      jobsEnv(admin.client),
      renderEvent(payment, tenant.organization.id),
    );
    expect(result).toBe('completed');

    const after = await readPayment(paymentId);
    const key = after['receipt_pdf_key'] as string;
    expect(key).toMatch(/^platform\/receipts\/\d{4}\/FS-\d+\.pdf$/);
    expect(admin.client.r2.objects.has(key)).toBe(true);
    expect(admin.client.r2.objects.get(key)?.contentType).toBe('application/pdf');
    expect(admin.client.queue.ofType('email.org_payment_received')).toHaveLength(1);
  });

  it('T3 entrega duplicada: sin segundo email ni segundo completado', async () => {
    // Sin reset entre ambas llamadas a propósito: el 2º debe ver el gate
    // de DB (`already-done`), no un spy limpio.
    const paymentId = await createProcessingPayment();
    await approvePayment(paymentId);
    const payment = await readPayment(paymentId);
    const event = renderEvent(payment, tenant.organization.id);

    expect(await handlePlatformReceiptRender(jobsEnv(admin.client), event)).toBe('completed');
    expect(await handlePlatformReceiptRender(jobsEnv(admin.client), event)).toBe('already-done');
    expect(admin.client.queue.ofType('email.org_payment_received')).toHaveLength(1);
  });

  it('T4 barrido: re-encola la vieja platform, ignora la reciente', async () => {
    async function numberedBackdated(ageMinutes: number): Promise<number> {
      const paymentId = await createProcessingPayment();
      await approvePayment(paymentId);
      await testQuery(
        `UPDATE platform_subscription_payment SET receipt_issued_at = now() - ($1 || ' minutes')::interval WHERE id = $2`,
        [String(ageMinutes), paymentId],
      );
      return paymentId;
    }

    resetSpies(admin.client);
    const oldId = await numberedBackdated(20);
    const recentId = await numberedBackdated(2);
    // Este reset descarta los renders del paso 1: el assert mide SOLO lo
    // que re-encola el sweep.
    resetSpies(admin.client);

    const { requeued } = await sweepPendingReceiptPdfs(sweepEnv(admin.client));
    expect(requeued).toBe(1);
    const renders = admin.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]!['paymentId']).toBe(oldId);
    expect(renders[0]!['scope']).toBe('platform');
    expect(renders).not.toContainEqual(expect.objectContaining({ paymentId: recentId }));
  });

  it('T5 trial $0: SKIP sin quemar número (pre_system terminal)', async () => {
    resetSpies(admin.client);
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: true,
      payment: {
        amountPaidCents: 0,
        currencyPaid: 'USD',
        baseAmountCents: 0,
        paymentMethod: 'trial',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const payment = await readPayment(
      Number(
        (
          await testQuery<{ id: number }>(
            `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
            [res.body.id],
          )
        )[0]!.id,
      ),
    );
    expect(payment['receipt_number']).toBeNull();
    expect(admin.client.receiptQueue.ofType('receipt.render')).toHaveLength(0);
    expect(admin.client.queue.ofType('email.org_payment_received')).toHaveLength(0);
  });

  it('T6 transición: re-PATCH validated no renumera', async () => {
    const paymentId = await createProcessingPayment();
    await approvePayment(paymentId);
    const first = (await readPayment(paymentId))['receipt_number'] as string;
    resetSpies(admin.client);

    const res = await approvePayment(paymentId);
    expect(res.status, res.text).toBe(200);
    expect((await readPayment(paymentId))['receipt_number']).toBe(first);
    // Sin serie quemada de más: ningún render nuevo.
    expect(admin.client.receiptQueue.ofType('receipt.render')).toHaveLength(0);
  });

  it('T7 RBAC: support 403 al aprobar, periodo acumulativo intacto', async () => {
    const paymentId = await createProcessingPayment();
    const support = await registerPlatformUser('support');

    const denied = await approvePayment(paymentId, support.client);
    expect(denied.status, denied.text).toBe(403);

    const before = await testQuery<{ current_period_end: string | Date }>(
      `SELECT s.current_period_end FROM platform_subscription s
       JOIN platform_subscription_payment p ON p.subscription_id = s.id
       WHERE p.id = $1`,
      [paymentId],
    );
    const res = await approvePayment(paymentId);
    expect(res.status, res.text).toBe(200);
    const after = await testQuery<{ current_period_end: string | Date }>(
      `SELECT s.current_period_end FROM platform_subscription s
       JOIN platform_subscription_payment p ON p.subscription_id = s.id
       WHERE p.id = $1`,
      [paymentId],
    );
    // Sub creada hace 60 días con plan mensual: aprobar extiende el periodo.
    expect(new Date(after[0]!.current_period_end) > new Date(before[0]!.current_period_end)).toBe(true);
    expect((await readPayment(paymentId))['receipt_number']).toMatch(/^FS-\d{7,}$/);
  });
});
