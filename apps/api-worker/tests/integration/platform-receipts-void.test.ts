/**
 * Platform receipts void tests (SaaS voiding).
 *
 * Covers: voiding a numbered payment preserves number+PDF and sets the
 * ANULADO flag; void without a number → **200 with `receiptVoided:false` +
 * `receiptVoidReason:'not_issued'`** (the payment status does change; the code
 * `RECEIPT_NOT_ISSUED` is an internal service contract); re-void is
 * idempotent (audit intact); support 403 (inherited from `console:manage`);
 * void neither cancels the subscription nor reverts the cumulative period.
 *
 * Voiding enqueues the render of the stamped PDF and until that artifact
 * exists (`receipt_voided_pdf_key`) the contract does NOT deliver the emission
 * PDF (202 + 404): a voided receipt never travels without its seal. Neither is
 * it resent by email (409 `RECEIPT_VOIDED`).
 *
 * RD-159: the same sweep repair of a LOST `receipt_voided` flag is mirrored
 * here for the SaaS emitter (`flagPlatformVoidedIfMissing`).
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
import { handlePlatformReceiptRender, sweepPendingReceiptPdfs } from '../../../jobs-worker/src/handlers/receipt.handler';

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

  /**
   * Status PATCH. RD-163: `voided` requires a non-blank `voidReason`, so the
   * helper supplies one unless a test passes its own.
   */
  async function setStatus(
    paymentId: number,
    status: string,
    client = admin.client,
    voidReason = 'Pago anulado',
  ) {
    return client.patch(`/api/platform/subscriptions/payments/${paymentId}/status`, {
      status,
      ...(status === 'voided' ? { voidReason } : {}),
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

  function sweepEnv(client: ReturnType<typeof createClient>) {
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      RECEIPT_QUEUE: client.env['RECEIPT_QUEUE'] as Queue,
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
    // The body confirms the receipt was left ANULADO.
    expect(res.body).toMatchObject({ receiptVoided: true });

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

    // The void also enqueued the render of the stamped artifact.
    expect(
      admin.client.receiptQueue
        .ofType('receipt.render')
        .map((m) => Number(m['paymentId'])),
    ).toContain(paymentId);

    // And the original stops being delivered: the voided one has no seal yet.
    const pending = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(pending.status, pending.text).toBe(202);
    expect(pending.body).toMatchObject({
      available: true,
      pdfStatus: 'pending',
      receiptNumber,
    });
    const blockedPdf = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(blockedPdf.status).toBe(404);

    // Step 2 of the voided one: NEW artifact, no email, and only then is it delivered.
    expect(
      await handlePlatformReceiptRender(jobsEnv(admin.client), {
        type: 'receipt.render',
        scope: 'platform',
        paymentId,
        organizationId: tenant.organization.id,
        receiptNumber,
      }),
    ).toBe('completed');

    const rendered = await readPayment(paymentId);
    const voidedKey = rendered['receipt_voided_pdf_key'] as string;
    expect(voidedKey).toMatch(/-anulado\.pdf$/);
    expect(voidedKey).not.toBe(before['receipt_pdf_key']);
    // The emission PDF is preserved intact (write-once).
    expect(rendered['receipt_pdf_key']).toBe(before['receipt_pdf_key']);
    expect(admin.client.r2.objects.has(voidedKey)).toBe(true);
    expect(admin.client.r2.objects.has(before['receipt_pdf_key'] as string)).toBe(true);

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

    const pdf = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(200);

    // A voided receipt is not resent (it would go out without the seal).
    const resend = await admin.client.post(
      `/api/platform/subscriptions/payments/${paymentId}/resend`,
    );
    expect(resend.status, resend.text).toBe(409);
    expect(resend.body.code).toBe('RECEIPT_VOIDED');
  });

  it('void sin número: 200 con receiptVoided false + motivo (el status cambia igual)', async () => {
    const paymentId = await createProcessingPayment();
    // There is no receipt to void; the payment status change is NOT
    // reverted and the response says so explicitly instead of hiding it.
    const res = await setStatus(paymentId, 'voided');
    expect(res.status, res.text).toBe(200);
    expect(res.body).toMatchObject({
      receiptVoided: false,
      receiptVoidReason: 'not_issued',
    });
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

  it('support 403 al anular (heredado de console:manage)', async () => {
    const { paymentId } = await approveAndComplete();
    const support = await registerPlatformUser('support');
    const res = await setStatus(paymentId, 'voided', support.client);
    expect(res.status, res.text).toBe(403);
    expect((await readPayment(paymentId))['receipt_voided']).toBe(false);
  });

  it('barrido: anulado SaaS SIN el flag (escritura perdida) se repara y encola el sello', async () => {
    const { paymentId, receiptNumber } = await approveAndComplete();
    const voided = await setStatus(paymentId, 'voided');
    expect(voided.status, voided.text).toBe(200);

    // RD-159 mirror: the status change landed, `receipt_voided` did not.
    await testQuery(
      `UPDATE platform_subscription_payment
          SET receipt_voided = false, voided_at = now() - interval '20 minutes'
        WHERE id = $1`,
      [paymentId],
    );
    // Audit as the row is AFTER the lost write: the repair must not touch it.
    const broken = await readPayment(paymentId);
    expect(broken['receipt_voided']).toBe(false);

    // THE BUG (before the spies are reset, the download reads R2): the emission
    // PDF of a voided payment is delivered again while the flag is off.
    const leaked = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(leaked.status, leaked.text).toBe(200);

    resetSpies(admin.client);
    const { repairedVoided } = await sweepPendingReceiptPdfs(sweepEnv(admin.client));
    expect(repairedVoided).toBeGreaterThanOrEqual(1);

    const repaired = await readPayment(paymentId);
    expect(repaired['receipt_voided']).toBe(true);
    // Audit preserved verbatim: the sweep never invents an actor or a reason.
    expect(repaired['voided_by']).toBe(broken['voided_by']);
    expect(repaired['void_reason']).toBe(broken['void_reason']);
    expect(new Date(repaired['voided_at'] as string).getTime()).toBe(
      new Date(broken['voided_at'] as string).getTime(),
    );
    expect(repaired['receipt_voided_pdf_key']).toBeNull();

    // One render for THIS payment, with the platform scope.
    const renders = admin.client.receiptQueue
      .ofType('receipt.render')
      .filter((m) => Number(m['paymentId']) === paymentId);
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ scope: 'platform', receiptNumber });

    // Fail-closed again while the seal is missing.
    const blocked = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(blocked.status).toBe(404);

    // The enqueued event produces the sealed artifact and only then the download.
    expect(
      await handlePlatformReceiptRender(jobsEnv(admin.client), {
        type: 'receipt.render',
        scope: 'platform',
        paymentId,
        organizationId: tenant.organization.id,
        receiptNumber,
      }),
    ).toBe('completed');
    expect((await readPayment(paymentId))['receipt_voided_pdf_key']).toMatch(/-anulado\.pdf$/);
    const served = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(served.status, served.text).toBe(200);

    // Second pass: nothing left to repair nor to render for this payment.
    resetSpies(admin.client);
    await sweepPendingReceiptPdfs(sweepEnv(admin.client));
    expect(
      admin.client.receiptQueue
        .ofType('receipt.render')
        .filter((m) => Number(m['paymentId']) === paymentId),
    ).toHaveLength(0);
  });
});
