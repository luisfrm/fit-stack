/**
 * Downloadable VOIDED receipt — integration.
 *
 * The bug it covers: `receipt_voided` flagged the receipt in the DB and the panel
 * showed "Anulado", but the PDF in R2 was still the emission one, so
 * `GET /api/payments/:id/receipt/pdf` delivered a document without the seal —
 * exactly the artifact that gives probative validity.
 *
 * Implemented rule (fail-closed): a voided receipt delivers ONLY its stamped
 * PDF (`<numero>-anulado.pdf`, column `receipt_voided_pdf_key`); until
 * that render exists, the contract answers `pending` and the original is NOT
 * served. The emission PDF is never rewritten (write-once).
 *
 * Step 2 runs for real (`handleReceiptRender` from jobs-worker, with the
 * renderer stubbed): it is the only way to assert that the sidecar is written
 * with its gate and without an email.
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
import { createGymTenant, createGymMember, createPlan, isoDate } from '../helpers/auth';
import {
  handleReceiptRender,
  sweepPendingReceiptPdfs,
  type ReceiptHandlerEnv,
  type SweepEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Receipts voided PDF', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
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

  async function readPayment(paymentId: number): Promise<Record<string, unknown>> {
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE id = $1`,
      [paymentId],
    );
    return rows[0]!;
  }

  /**
   * Tenant + validated payment (step 1 via HTTP) + REAL step 2: leaves the
   * receipt with a number and the emission PDF in R2, ready to void.
   */
  async function createReadyReceipt() {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 10000, currency: 'USD' });

    const created = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(created.status, created.text).toBe(201);

    const rows = await testQuery<{ id: number; receipt_number: string }>(
      `SELECT id, receipt_number FROM payment WHERE subscription_id = $1`,
      [created.body.id],
    );
    const paymentId = Number(rows[0]!.id);
    const receiptNumber = rows[0]!.receipt_number;

    expect(
      await handleReceiptRender(jobsEnv(owner.client), {
        type: 'receipt.render',
        scope: 'panel',
        paymentId,
        organizationId: organization.id,
        receiptNumber,
      }),
    ).toBe('completed');

    const payment = await readPayment(paymentId);
    const originalKey = payment['receipt_pdf_key'] as string;
    expect(originalKey).toBeTruthy();
    expect(owner.client.r2.objects.has(originalKey)).toBe(true);

    return { owner, organization, member, paymentId, receiptNumber, originalKey };
  }

  /** Voids via the real endpoint and returns the body. */
  async function voidPayment(
    owner: { client: ReturnType<typeof createClient> },
    paymentId: number,
  ) {
    return owner.client.patch(`/api/payments/${paymentId}/status`, {
      status: 'voided',
      voidReason: 'Cobro registrado por error',
    });
  }

  it('T1 anular deja el comprobante ANULADO y sin PDF descargable hasta el render', async () => {
    const { owner, paymentId, receiptNumber, originalKey } = await createReadyReceipt();

    resetSpies(owner.client);
    const patched = await voidPayment(owner, paymentId);
    expect(patched.status, patched.text).toBe(200);
    expect(patched.body).toMatchObject({ receiptVoided: true });

    // The number is preserved (never released nor reused) and the void enqueues the
    // render of the stamped artifact.
    const payment = await readPayment(paymentId);
    expect(payment['receipt_number']).toBe(receiptNumber);
    expect(payment['receipt_voided']).toBe(true);
    expect(payment['receipt_pdf_key']).toBe(originalKey);
    expect(payment['receipt_voided_pdf_key']).toBeNull();

    const renders = owner.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ paymentId, receiptNumber });

    // THE REGRESSION: with the emission PDF present, the contract does NOT deliver it.
    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status).toBe(202);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'pending',
      receiptNumber,
    });

    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(404);
  });

  it('T2 paso 2 del anulado: escribe el sidecar con sello, sin email, y la descarga lo sirve', async () => {
    const { owner, organization, paymentId, receiptNumber, originalKey } =
      await createReadyReceipt();

    const patched = await voidPayment(owner, paymentId);
    expect(patched.status, patched.text).toBe(200);
    // The queues are cleared (the fixture's step 2 already enqueued its email) but NOT
    // R2: asserting that the emission PDF is still intact requires seeing it.
    owner.client.queue.reset();
    owner.client.receiptQueue.reset();

    const event = {
      type: 'receipt.render' as const,
      scope: 'panel' as const,
      paymentId,
      organizationId: organization.id,
      receiptNumber,
    };
    expect(await handleReceiptRender(jobsEnv(owner.client), event)).toBe('completed');

    // NEW artifact: the emission one stays intact in R2 (write-once).
    const payment = await readPayment(paymentId);
    const voidedKey = payment['receipt_voided_pdf_key'] as string;
    expect(voidedKey).toMatch(/-anulado\.pdf$/);
    expect(voidedKey).not.toBe(originalKey);
    expect(payment['receipt_pdf_key']).toBe(originalKey);
    expect(owner.client.r2.objects.has(originalKey)).toBe(true);
    expect(owner.client.r2.objects.has(voidedKey)).toBe(true);
    expect(owner.client.r2.objects.get(voidedKey)?.contentType).toBe('application/pdf');

    // Voiding does not notify: the valid receipt was already sent.
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(0);

    // Now yes: `ready` contract and download of the stamped document.
    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({ available: true, pdfStatus: 'ready', receiptNumber });
    expect(receipt.body.receipt.voided).toBe(true);

    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');

    // Re-delivery: it does not re-render (the sidecar gate is already taken).
    resetSpies(owner.client);
    expect(await handleReceiptRender(jobsEnv(owner.client), event)).toBe('already-done');
    expect(owner.client.r2.objects.size).toBe(0);
  });

  it('T3 reenviar el comprobante de un pago anulado: 409 RECEIPT_VOIDED', async () => {
    const { owner, paymentId } = await createReadyReceipt();
    await voidPayment(owner, paymentId);

    const send = await owner.client.post(`/api/payments/${paymentId}/send-email`);
    expect(send.status).toBe(409);
    expect(send.body.code).toBe('RECEIPT_VOIDED');

    // A payment in force with a PDF still resends the same (no regression).
    const fresh = await createReadyReceipt();
    resetSpies(fresh.owner.client);
    const ok = await fresh.owner.client.post(`/api/payments/${fresh.paymentId}/send-email`);
    expect(ok.status, ok.text).toBe(200);
    expect(fresh.owner.client.queue.ofType('email.payment_receipt')).toHaveLength(1);
  });

  it('T4 re-anular es idempotente y no duplica el render del sello', async () => {
    const { owner, paymentId } = await createReadyReceipt();

    const first = await voidPayment(owner, paymentId);
    expect(first.body).toMatchObject({ receiptVoided: true });
    resetSpies(owner.client);

    const second = await voidPayment(owner, paymentId);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ receiptVoided: true });

    // Already voided with the seal pending: it is re-enqueued ONCE (repair),
    // never twice per request.
    expect(owner.client.receiptQueue.ofType('receipt.render')).toHaveLength(1);

    // With the seal already written, a re-void does not enqueue anything again.
    const payment = await readPayment(paymentId);
    await testQuery(`UPDATE payment SET receipt_voided_pdf_key = $1 WHERE id = $2`, [
      `${payment['receipt_number'] as string}-anulado.pdf`,
      paymentId,
    ]);
    resetSpies(owner.client);
    const third = await voidPayment(owner, paymentId);
    expect(third.status).toBe(200);
    expect(owner.client.receiptQueue.ofType('receipt.render')).toHaveLength(0);
  });

  it('T5 barrido: un anulado sin PDF con sello se recupera y el original sigue sin servirse', async () => {
    const { owner, paymentId } = await createReadyReceipt();
    await voidPayment(owner, paymentId);

    // Simulates the lost render: the void went stale and the sidecar never arrived.
    await testQuery(
      `UPDATE payment SET voided_at = now() - interval '20 minutes' WHERE id = $1`,
      [paymentId],
    );
    resetSpies(owner.client);

    const { requeued } = await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(requeued).toBeGreaterThanOrEqual(1);
    expect(
      owner.client.receiptQueue
        .ofType('receipt.render')
        .map((m) => Number(m['paymentId'])),
    ).toContain(paymentId);

    // And the sweep does not loosen the fail-closed rule.
    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(404);
  });
});
