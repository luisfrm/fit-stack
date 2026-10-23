/**
 * Receipts emission integration tests.
 *
 * Covers: step 1 numbering via HTTP (number + receipt.render, taxes
 * persisted, zero emails), step 2 completion via the real jobs-worker
 * handler (R2 + pdf_key + gated email), at-least-once idempotency, sweep,
 * the 3-state contract, issue/send-email branches, void preservation,
 * RBAC and the review constraints (codes, coherence).
 *
 * The PDF renderer is stubbed (`vi.mock` on jobs-worker's receipt-pdf):
 * render fidelity is covered by jobs-worker's own smoke test; here we
 * assert the step-2 LOGIC (gate rowCount===1, no second email, R2 put).
 * Everything else (DB, queues, R2) is real via spies.
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
  addUserToOrganization,
  createGymMember,
  createPlan,
  declareFormalTaxpayer,
  isoDate,
} from '../helpers/auth';
import { createDb } from '@workspace/database/factory';
import {
  handleReceiptRender,
  sweepPendingReceiptPdfs,
  type ReceiptHandlerEnv,
  type SweepEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';
import { createReceiptsService } from '../../src/services/receipts.service';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipts emission', () => {
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

  /**
   * Tenant + member + plan + validated $100.00 USD payment via HTTP.
   * `declareFormal` declares the location a formal taxpayer from CONSOLE (the
   * only writer of `fiscalConfig.isFormalTaxpayer`); without a declaration
   * there is no breakdown.
   */
  async function createValidatedPayment(
    declareFormal = false,
    paymentMethodDetails: unknown[] = [],
  ) {
    const { owner, organization } = await createGymTenant();
    if (declareFormal) {
      await declareFormalTaxpayer(organization.id);
    }
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 10000, currency: 'USD' });
    resetSpies(owner.client);
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails,
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    return { owner, organization, member, plan, payment: rows[0]! };
  }

  it('T1 paso 1: número inmediato + receipt.render + sin desglose, cero emails', async () => {
    const { owner, organization, payment } = await createValidatedPayment();

    expect(payment['receipt_number']).toMatch(
      new RegExp(`^\\d{4}-\\d{6}$`),
    );
    // Location WITHOUT declaring itself a formal taxpayer → the receipt does not
    // itemize taxes (the total is persisted, never a VAT it did not declare).
    expect(payment['tax_details']).toEqual([]);
    expect(Number(payment['subtotal'])).toBe(10000);
    expect(Number(payment['tax_total'])).toBe(0);

    const renders = owner.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      scope: 'panel',
      paymentId: Number(payment['id']),
      organizationId: organization.id,
      receiptNumber: payment['receipt_number'],
    });
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(0);

    const receipt = await owner.client.get(
      `/api/payments/${Number(payment['id'])}/receipt`,
    );
    expect(receipt.status).toBe(202);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'pending',
      receiptNumber: payment['receipt_number'],
    });
  });

  it('T1b sede FORMAL: desglose IVA + IGTF con base gross_first y cuadre exacto', async () => {
    const { payment } = await createValidatedPayment(true);

    // VE + USD + formal (Console): IGTF = 3 % of 10000 = 300 (extracted
    // first); remainder 9700 → base = round(9700 / 1.16) = 8362 · VAT = 1338.
    const details = payment['tax_details'] as Array<{ name: string; amount: number }>;
    expect(details.map((d) => d.name).sort()).toEqual(['IGTF', 'IVA']);
    expect(details.find((d) => d.name === 'IGTF')?.amount).toBe(300);
    expect(details.find((d) => d.name === 'IVA')?.amount).toBe(1338);
    expect(Number(payment['subtotal'])).toBe(8362);
    expect(Number(payment['tax_total'])).toBe(1638);
    expect(Number(payment['subtotal']) + Number(payment['tax_total'])).toBe(10000);
  });

  it('T1c emisión por el estado PERSISTIDO: payload sin `status` también numera', async () => {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, {
      price: 7000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
    });
    resetSpies(owner.client);

    // `status` is optional in the contract and the repo normalizes it to
    // `validated`. Deciding the emission from the payload (as before) left a
    // VALIDATED payment with no number, no render and no email: only repairable by hand
    // with POST /:id/issue (the PATCH to validated does not number if it already was).
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 7000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT status, receipt_number, receipt_issued_at,
              plan_snapshot_duration_value, plan_snapshot_duration_unit
         FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    expect(rows[0]!['status']).toBe('validated');
    expect(rows[0]!['receipt_number']).toMatch(
      new RegExp(`^\\d{4}-\\d{6}$`),
    );
    expect(rows[0]!['receipt_issued_at']).not.toBeNull();
    // Snapshot of the duration used to compute the period.
    expect(Number(rows[0]!['plan_snapshot_duration_value'])).toBe(1);
    expect(rows[0]!['plan_snapshot_duration_unit']).toBe('month');

    expect(owner.client.receiptQueue.ofType('receipt.render')).toHaveLength(1);
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(0);
  });

  it('T1d referencia del operador con forma de UUID: emite igual (checklist no la juzga)', async () => {
    // A bank reference can match `8-4-4-4-12` hex. The
    // checklist catches technical leaks of the SYSTEM, not the operator's text: if
    // it scans it, the render throws, the message dies in the DLQ and the receipt
    // is left with no PDF and no email forever (the sweep re-enqueues it every 10 h).
    const { owner, organization, payment } = await createValidatedPayment(false, [
      { type: 'text', label: 'Referencia', value: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' },
    ]);

    expect(payment['receipt_number']).toMatch(
      new RegExp(`^\\d{4}-\\d{6}$`),
    );
    const renders = owner.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      scope: 'panel',
      paymentId: Number(payment['id']),
      receiptNumber: payment['receipt_number'],
    });
  });

  it('T2 paso 2: completa PDF en R2 y encola el email (gate rowCount===1)', async () => {
    const { owner, organization, payment } = await createValidatedPayment();
    const paymentId = Number(payment['id']);
    const receiptNumber = payment['receipt_number'] as string;

    const result = await handleReceiptRender(jobsEnv(owner.client), {
      type: 'receipt.render',
      scope: 'panel',
      paymentId,
      organizationId: organization.id,
      receiptNumber,
    });
    expect(result).toBe('completed');

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT receipt_pdf_key FROM payment WHERE id = $1`,
      [paymentId],
    );
    const key = rows[0]!['receipt_pdf_key'] as string;
    expect(key).toMatch(/^receipts\/.+\/\d{4}\/.+\.pdf$/);
    expect(owner.client.r2.objects.has(key)).toBe(true);
    expect(owner.client.r2.objects.get(key)?.contentType).toBe('application/pdf');
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(1);

    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'ready',
      receiptNumber,
    });
    expect(receipt.body.receipt.document.number).toBe(receiptNumber);
    expect(receipt.body.receipt.amounts.total).toBe(10000);

    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
  });

  it('T3 entrega duplicada: sin segundo email ni segundo completado', async () => {
    const { owner, organization, payment } = await createValidatedPayment();
    const event = {
      type: 'receipt.render' as const,
      scope: 'panel' as const,
      paymentId: Number(payment['id']),
      organizationId: organization.id,
      receiptNumber: payment['receipt_number'] as string,
    };
    expect(await handleReceiptRender(jobsEnv(owner.client), event)).toBe('completed');
    expect(await handleReceiptRender(jobsEnv(owner.client), event)).toBe('already-done');
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(1);
  });

  it('T4 barrido: re-encola la vieja, ignora la reciente', async () => {
    const { owner } = await createGymTenant();
    async function numberedBackdated(ageMinutes: number): Promise<number> {
      const member = await createGymMember(owner.client);
      const plan = await createPlan(owner.client, { price: 500, currency: 'USD' });
      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 500,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
      expect(res.status, res.text).toBe(201);
      const rows = await testQuery<{ id: number }>(
        `SELECT id FROM payment WHERE subscription_id = $1`,
        [res.body.id],
      );
      const paymentId = Number(rows[0]!.id);
      await testQuery(
        `UPDATE payment SET receipt_issued_at = now() - ($1 || ' minutes')::interval WHERE id = $2`,
        [String(ageMinutes), paymentId],
      );
      return paymentId;
    }

    resetSpies(owner.client);
    const oldId = await numberedBackdated(20);
    const recentId = await numberedBackdated(2);
    resetSpies(owner.client);

    const { requeued } = await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(requeued).toBe(1);
    const renders = owner.client.receiptQueue.ofType('receipt.render');
    expect(renders).toHaveLength(1);
    expect(renders[0]!['paymentId']).toBe(oldId);
    expect(renders).not.toContainEqual(expect.objectContaining({ paymentId: recentId }));
  });

  it('T4b barrido: PDF listo sin notificar se recupera y no re-renderiza', async () => {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 500, currency: 'USD' });

    resetSpies(owner.client);
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 500,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number; receipt_pdf_key: string | null }>(
      `SELECT id, receipt_pdf_key FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    const paymentId = Number(rows[0]!.id);
    expect(rows[0]!.receipt_pdf_key).toBeNull();

    // Complete step 2 (PDF in R2 + email enqueued + notified flag).
    const event = owner.client.receiptQueue.ofType('receipt.render')[0]!;
    expect(
      await handleReceiptRender(jobsEnv(owner.client), {
        type: 'receipt.render',
        scope: 'panel',
        paymentId,
        organizationId: organization.id,
        receiptNumber: event['receiptNumber'] as string,
      }),
    ).toBe('completed');
    const pdfKey = (
      await testQuery<{ receipt_pdf_key: string }>(
        `SELECT receipt_pdf_key FROM payment WHERE id = $1`,
        [paymentId],
      )
    )[0]!.receipt_pdf_key;
    expect(owner.client.r2.objects.has(pdfKey)).toBe(true);

    // Simulates the lost notification: the render was done but the step-2
    // email never went out. The sweep is the only thing that recovers that row.
    await testQuery(
      `UPDATE payment SET receipt_issued_at = now() - interval '45 minutes', receipt_notified_at = NULL WHERE id = $1`,
      [paymentId],
    );
    resetSpies(owner.client);

    // The sweep is global (it does not filter by org): it may re-enqueue pending rows
    // from other tests, so it is asserted by presence, not by count.
    const { requeued } = await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(requeued).toBeGreaterThanOrEqual(1);
    const renders = owner.client.receiptQueue.ofType('receipt.render');
    expect(renders).toContainEqual(expect.objectContaining({ paymentId }));

    // The re-enqueued event does NOT re-render (the PDF already exists): if it entered the
    // render path, it would repopulate the object in the R2 spy — which we emptied on
    // purpose to be able to assert it.
    owner.client.r2.reset();
    expect(
      await handleReceiptRender(jobsEnv(owner.client), {
        type: 'receipt.render',
        scope: 'panel',
        paymentId,
        organizationId: organization.id,
        receiptNumber: event['receiptNumber'] as string,
      }),
    ).toBe('completed');
    expect(owner.client.r2.objects.size).toBe(0);
    // And it does recover the lost notification.
    expect(owner.client.queue.ofType('email.payment_receipt')).toHaveLength(1);

    // Second pass: already notified → THAT payment is not enqueued again.
    resetSpies(owner.client);
    await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(
      owner.client.receiptQueue.ofType('receipt.render').map((r) => r['paymentId']),
    ).not.toContain(paymentId);
  });

  it('T5 contrato: pre_system 200 sin 409, pdf pendiente 404', async () => {
    const { owner } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 100,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    const paymentId = Number(rows[0]!.id);

    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toEqual({ available: false, reason: 'pre_system' });

    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(404);
  });

  it('T6 issue: processing 409, validated numera, renumerar es idempotente', async () => {
    const { owner, organization } = await createGymTenant();
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    async function createWithStatus(status: string): Promise<number> {
      const res = await owner.client.post('/api/subscriptions', {
        memberId: (await createGymMember(owner.client)).id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status,
          paymentDate: isoDate(0),
        },
      });
      expect(res.status, res.text).toBe(201);
      const rows = await testQuery<{ id: number }>(
        `SELECT id FROM payment WHERE subscription_id = $1`,
        [res.body.id],
      );
      return Number(rows[0]!.id);
    }

    const processingId = await createWithStatus('processing');
    const processing = await owner.client.post(`/api/payments/${processingId}/issue`);
    expect(processing.status).toBe(409);
    expect(processing.body.code).toBe('NOT_VALIDATED');

    const validatedId = await createWithStatus('validated');
    // Clears the auto-assigned number (and its claim: the emission claims the
    // row before consuming the sequence) to test the manual fallback.
    await testQuery(
      `UPDATE payment SET receipt_number = NULL, receipt_claim_at = NULL, receipt_issued_at = NULL, subtotal = NULL, tax_total = NULL, tax_details = NULL WHERE id = $1`,
      [validatedId],
    );
    resetSpies(owner.client);
    const issued = await owner.client.post(`/api/payments/${validatedId}/issue`);
    expect(issued.status).toBe(200);
    expect(issued.body.pdfStatus).toBe('pending');
    expect(issued.body.receiptNumber).toMatch(/^\d{4}-\d{6}$/);

    const seq = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence WHERE organization_id = $1 AND document_type = 'receipt'`,
      [organization.id],
    );
    const lastBefore = Number(seq[0]!.last_number);
    const again = await owner.client.post(`/api/payments/${validatedId}/issue`);
    expect(again.status).toBe(200);
    expect(again.body.receiptNumber).toBe(issued.body.receiptNumber);
    // Idempotent: it does not burn another sequence number.
    const seqAfter = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence WHERE organization_id = $1 AND document_type = 'receipt'`,
      [organization.id],
    );
    expect(Number(seqAfter[0]!.last_number)).toBe(lastBefore);
  });

  it('T7 constraints: void sin número 409, re-void idempotente, 404 cross-org', async () => {
    const { owner, organization } = await createGymTenant();
    const other = await createGymTenant();
    const svc = createReceiptsService(
      createDb(TEST_DATABASE_URL),
      owner.client.env['RECEIPT_QUEUE'] as Queue,
    );

    // Payment without a number → 409 RECEIPT_NOT_ISSUED.
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 100,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    const processingId = Number(rows[0]!.id);
    async function expectReceiptCode(
      fn: () => Promise<unknown>,
      code: string,
    ): Promise<void> {
      try {
        await fn();
      } catch (err) {
        expect((err as { code?: string })?.code).toBe(code);
        return;
      }
      throw new Error(`Se esperaba el código ${code} y no lanzó.`);
    }
    await expectReceiptCode(
      () =>
        svc.markReceiptVoided({
          orgId: organization.id,
          paymentId: processingId,
          by: 'user-1',
          reason: 'x',
        }),
      'RECEIPT_NOT_ISSUED',
    );

    // Cross-org → 404.
    await expectReceiptCode(
      () =>
        svc.markReceiptVoided({
          orgId: other.organization.id,
          paymentId: processingId,
          by: 'user-1',
          reason: 'x',
        }),
      'PAYMENT_NOT_FOUND',
    );

    // Idempotent re-void without overwriting the audit trail.
    const { payment } = await createValidatedPayment();
    const numberedId = Number(payment['id']);
    const first = await svc.markReceiptVoided({
      orgId: payment['organization_id'] as string,
      paymentId: numberedId,
      by: 'user-first',
      reason: 'motivo original',
    });
    const second = await svc.markReceiptVoided({
      orgId: payment['organization_id'] as string,
      paymentId: numberedId,
      by: 'user-second',
      reason: 'otro motivo',
    });
    expect(second).toMatchObject({
      receiptVoided: true,
      voidedBy: 'user-first',
      voidReason: 'motivo original',
    });
    expect(first.receiptNumber).toBe(payment['receipt_number']);
  });

  it('T8 void vía PATCH conserva número y cancela subscription', async () => {
    const { owner, payment } = await createValidatedPayment();
    const paymentId = Number(payment['id']);
    const receiptNumber = payment['receipt_number'] as string;

    const patched = await owner.client.patch(`/api/payments/${paymentId}/status`, {
      status: 'voided',
    });
    expect(patched.status).toBe(200);
    // The receipt WAS voided and the body says so (not a mute 200).
    expect(patched.body).toMatchObject({ receiptVoided: true });
    expect(patched.body.receiptVoidReason).toBeUndefined();

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT receipt_number, receipt_voided, void_reason FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!['receipt_number']).toBe(receiptNumber);
    expect(rows[0]!['receipt_voided']).toBe(true);
  });

  it('T8b void sin comprobante: 200 con receiptVoided false + motivo', async () => {
    const { owner } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 100,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    const paymentId = Number(rows[0]!.id);

    const patched = await owner.client.patch(`/api/payments/${paymentId}/status`, {
      status: 'voided',
    });
    // The status changes anyway; what is made explicit is that there was NO receipt.
    expect(patched.status, patched.text).toBe(200);
    expect(patched.body).toMatchObject({
      receiptVoided: false,
      receiptVoidReason: 'not_issued',
    });

    const after = await testQuery<Record<string, unknown>>(
      `SELECT status, receipt_number, receipt_voided FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(after[0]!['status']).toBe('voided');
    expect(after[0]!['receipt_number']).toBeNull();
    expect(after[0]!['receipt_voided']).toBe(false);
  });

  it('T9 sin email: emite igual; send-email 422', async () => {
    const { owner, member } = await createValidatedPayment();
    const paymentId = Number(
      (
        await testQuery<{ id: number }>(
          `SELECT id FROM payment WHERE member_id = $1 ORDER BY id DESC LIMIT 1`,
          [member.id],
        )
      )[0]!.id,
    );
    await testQuery(`UPDATE gym_member SET email = '' WHERE id = $1`, [member.id]);

    // The emission already happened in the POST (step 1 does not require an email).
    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status).toBe(202);

    const send = await owner.client.post(`/api/payments/${paymentId}/send-email`);
    expect(send.status).toBe(422);
    expect(send.body.code).toBe('MEMBER_EMAIL_MISSING');
  });

  it('T10 send-email 4 ramas + RBAC', async () => {
    const { owner, organization } = await createValidatedPayment();
    const cashier = await addUserToOrganization(
      organization.id,
      ORG_ROLES.CASHIER,
      'cashier-receipt',
    );

    // Pending branch: re-enqueues render + 202.
    const pending = await testQuery<{ id: number }>(
      `SELECT p.id FROM payment p JOIN subscription s ON s.id = p.subscription_id
       WHERE p.organization_id = $1 AND p.receipt_number IS NOT NULL AND p.receipt_pdf_key IS NULL
       ORDER BY p.id DESC LIMIT 1`,
      [organization.id],
    );
    const pendingId = Number(pending[0]!.id);
    resetSpies(owner.client);
    const resend = await owner.client.post(`/api/payments/${pendingId}/send-email`);
    // The fixture member does have an email → re-enqueues render.
    expect(resend.status).toBe(202);
    expect(
      owner.client.receiptQueue
        .ofType('receipt.render')
        .filter((m) => Number(m['paymentId']) === pendingId),
    ).toHaveLength(1);

    // RBAC: cashier reads (202) and can issue (same UPDATE permission as
    // PATCH /:id/status: the matrix gives subscriptions UPDATE to cashier).
    const cashierRead = await cashier.client.get(`/api/payments/${pendingId}/receipt`);
    expect(cashierRead.status).toBe(202);
    const cashierIssue = await cashier.client.post(
      `/api/payments/${pendingId}/issue`,
    );
    expect(cashierIssue.status).toBe(200);

    // Anonymous: 401.
    const anon = await owner.client.get(`/api/payments/${pendingId}/receipt`, {
      anonymous: true,
    });
    expect(anon.status).toBe(401);
  });
});
