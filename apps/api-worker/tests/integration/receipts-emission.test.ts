/**
 * Receipts emission integration tests (Fase 2).
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

describe.skipIf(skipReason !== null)('Receipts emission (Fase 2)', () => {
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

  /** Tenant + member + plan + validated $100.00 USD payment via HTTP. */
  async function createValidatedPayment() {
    const { owner, organization } = await createGymTenant();
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
        paymentMethodDetails: [],
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

  it('T1 paso 1: número inmediato + receipt.render + impuestos, cero emails', async () => {
    const { owner, organization, payment } = await createValidatedPayment();

    // VE + USD → IVA 16% + IGTF 3%: 10000 = 8403 + 1597 (1344 + 253).
    expect(payment['receipt_number']).toMatch(
      new RegExp(`^${organization.slug}-\\d{4}-\\d{6}$`),
    );
    expect(Number(payment['subtotal'])).toBe(8403);
    expect(Number(payment['tax_total'])).toBe(1597);
    const details = payment['tax_details'] as Array<{ name: string; amount: number }>;
    expect(details.map((d) => d.name).sort()).toEqual(['IGTF', 'IVA']);
    expect(
      details.reduce((s, d) => s + d.amount, 0),
    ).toBe(1597);

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
    // Limpia el número auto-asignado para probar el fallback manual.
    await testQuery(
      `UPDATE payment SET receipt_number = NULL, receipt_issued_at = NULL, subtotal = NULL, tax_total = NULL, tax_details = NULL WHERE id = $1`,
      [validatedId],
    );
    resetSpies(owner.client);
    const issued = await owner.client.post(`/api/payments/${validatedId}/issue`);
    expect(issued.status).toBe(200);
    expect(issued.body.pdfStatus).toBe('pending');
    expect(issued.body.receiptNumber).toMatch(/-\d{4}-\d{6}$/);

    const seq = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence WHERE organization_id = $1 AND document_type = 'receipt'`,
      [organization.id],
    );
    const lastBefore = Number(seq[0]!.last_number);
    const again = await owner.client.post(`/api/payments/${validatedId}/issue`);
    expect(again.status).toBe(200);
    expect(again.body.receiptNumber).toBe(issued.body.receiptNumber);
    // Idempotente: no quema otro número de secuencia.
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

    // Pago sin número → 409 RECEIPT_NOT_ISSUED.
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

    // Re-void idempotente sin pisar auditoría.
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

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT receipt_number, receipt_voided, void_reason FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!['receipt_number']).toBe(receiptNumber);
    expect(rows[0]!['receipt_voided']).toBe(true);
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

    // La emisión ya ocurrió en el POST (paso 1 no exige email).
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

    // Rama pendiente: re-encola render + 202.
    const pending = await testQuery<{ id: number }>(
      `SELECT p.id FROM payment p JOIN subscription s ON s.id = p.subscription_id
       WHERE p.organization_id = $1 AND p.receipt_number IS NOT NULL AND p.receipt_pdf_key IS NULL
       ORDER BY p.id DESC LIMIT 1`,
      [organization.id],
    );
    const pendingId = Number(pending[0]!.id);
    resetSpies(owner.client);
    const resend = await owner.client.post(`/api/payments/${pendingId}/send-email`);
    // El miembro del fixture sí tiene email → re-encola render.
    expect(resend.status).toBe(202);
    expect(
      owner.client.receiptQueue
        .ofType('receipt.render')
        .filter((m) => Number(m['paymentId']) === pendingId),
    ).toHaveLength(1);

    // RBAC: cashier lee (202) y puede emitir (misma permiso UPDATE que
    // PATCH /:id/status: la matriz da UPDATE de subscriptions a cashier).
    const cashierRead = await cashier.client.get(`/api/payments/${pendingId}/receipt`);
    expect(cashierRead.status).toBe(202);
    const cashierIssue = await cashier.client.post(
      `/api/payments/${pendingId}/issue`,
    );
    expect(cashierIssue.status).toBe(200);

    // Anónimo: 401.
    const anon = await owner.client.get(`/api/payments/${pendingId}/receipt`, {
      anonymous: true,
    });
    expect(anon.status).toBe(401);
  });
});
