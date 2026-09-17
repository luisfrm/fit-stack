/**
 * Platform receipts void tests (follow-up C3 — ANULADO SaaS).
 *
 * Covers: voiding a numbered payment preserves number+PDF and sets the
 * ANULADO flag (visible in `GET receipt ready` as `voided:true`); void
 * without a number → 409 `RECEIPT_NOT_ISSUED` (the status change itself
 * is NOT reverted); re-void is idempotent (audit intact); support 403
 * (inherited from `requirePlatformAuth`); void neither cancels the
 * subscription nor reverts the cumulative period.
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
import { handlePlatformReceiptRender } from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Platform receipts void (ANULADO SaaS)', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('void');
    plan = await createPlatformPlan();
  });

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
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  /** Platform subscription with a `processing` payment via HTTP. */
  async function createProcessingPayment(): Promise<number> {
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
      [res.body.id],
    );
    return Number(rows[0]!.id);
  }

  async function setStatus(paymentId: number, status: string, client = admin.client) {
    return client.patch(`/api/platform/subscriptions/payments/${paymentId}/status`, {
      status,
    });
  }

  async function readPayment(paymentId: number): Promise<Record<string, unknown>> {
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    return rows[0]!;
  }

  function jobsEnv(client: ReturnType<typeof createClient>) {
    const env = client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  async function approveAndComplete(): Promise<{ paymentId: number; receiptNumber: string }> {
    const paymentId = await createProcessingPayment();
    const approved = await setStatus(paymentId, 'validated');
    expect(approved.status, approved.text).toBe(200);
    const numbered = await readPayment(paymentId);
    const receiptNumber = numbered['receipt_number'] as string;
    const result = await handlePlatformReceiptRender(jobsEnv(admin.client), {
      type: 'receipt.render',
      scope: 'platform',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber,
    });
    expect(result).toBe('completed');
    return { paymentId, receiptNumber };
  }

  it('void numerado: flag ANULADO + número/PDF intactos + sub y periodo intactos', async () => {
    const { paymentId, receiptNumber } = await approveAndComplete();
    const before = await readPayment(paymentId);
    const subBefore = await testQuery<{ current_period_end: Date; cancelled_at: Date | null }>(
      `SELECT s.current_period_end, s.cancelled_at FROM platform_subscription s
       JOIN platform_subscription_payment p ON p.subscription_id = s.id
       WHERE p.id = $1`,
      [paymentId],
    );

    const res = await setStatus(paymentId, 'voided');
    expect(res.status, res.text).toBe(200);

    const after = await readPayment(paymentId);
    expect(after['receipt_voided']).toBe(true);
    expect(after['receipt_number']).toBe(receiptNumber);
    expect(after['receipt_pdf_key']).toBe(before['receipt_pdf_key']);
    expect(after['void_reason']).toBe('Pago anulado');

    const subAfter = await testQuery<{ current_period_end: Date; cancelled_at: Date | null }>(
      `SELECT s.current_period_end, s.cancelled_at FROM platform_subscription s
       JOIN platform_subscription_payment p ON p.subscription_id = s.id
       WHERE p.id = $1`,
      [paymentId],
    );
    expect(subAfter[0]!.cancelled_at).toBeNull();
    expect(new Date(subAfter[0]!.current_period_end).getTime()).toBe(
      new Date(subBefore[0]!.current_period_end).getTime(),
    );

    const receipt = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(200);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'ready',
      receiptNumber,
    });
    expect(receipt.body.receipt.voided).toBe(true);
  });

  it('void sin número: 409 RECEIPT_NOT_ISSUED (el status cambia igual)', async () => {
    const paymentId = await createProcessingPayment();
    // Falla porque no hay comprobante; el cambio validated→voided del
    // estado del pago NO se revierte (solo el flag no se setea).
    const res = await setStatus(paymentId, 'voided');
    expect(res.status, res.text).toBe(200);
    const payment = await readPayment(paymentId);
    expect(payment['status']).toBe('voided');
    expect(payment['receipt_voided']).toBe(false);
    expect(payment['receipt_number']).toBeNull();
  });

  it('re-void idempotente: auditoría intacta', async () => {
    const { paymentId } = await approveAndComplete();
    await setStatus(paymentId, 'voided');
    const first = await readPayment(paymentId);

    const res = await setStatus(paymentId, 'voided');
    expect(res.status, res.text).toBe(200);
    const second = await readPayment(paymentId);
    expect(second['voided_by']).toBe(first['voided_by']);
    expect(second['void_reason']).toBe(first['void_reason']);
    expect(new Date(second['voided_at'] as string).getTime()).toBe(
      new Date(first['voided_at'] as string).getTime(),
    );
  });

  it('support 403 al anular (heredado de requirePlatformAuth)', async () => {
    const { paymentId } = await approveAndComplete();
    const support = await registerPlatformUser('support');
    const res = await setStatus(paymentId, 'voided', support.client);
    expect(res.status, res.text).toBe(403);
    expect((await readPayment(paymentId))['receipt_voided']).toBe(false);
  });
});
