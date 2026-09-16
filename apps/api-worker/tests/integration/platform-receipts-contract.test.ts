/**
 * Platform receipts contract integration tests (C3).
 *
 * Covers the 3-state contract (`GET receipt`: 200 ready / 202 pending /
 * 200 `available:false pre_system`; never 409), the binary download
 * (`GET receipt/pdf`: 200 bytes / 404), the 4 resend branches
 * (422 no recipients / pre_system without enqueue / pending 202 /
 * ready queued+attachment), and the RBAC matrix (support reads via
 * `subscription:list` but cannot resend; admin full; no session 401).
 *
 * Mirror of the Panel contract (payments.route.ts). HTTP real against
 * the Hono app + Neon branch; the PDF renderer is stubbed (`vi.mock`).
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
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Platform receipts contract (C3)', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('c3');
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

  async function approvePayment(paymentId: number) {
    return admin.client.patch(`/api/platform/subscriptions/payments/${paymentId}/status`, {
      status: 'validated',
    });
  }

  async function completePdf(paymentId: number, receiptNumber: string) {
    const result = await handlePlatformReceiptRender(jobsEnv(admin.client), {
      type: 'receipt.render',
      scope: 'platform',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber,
    });
    expect(result).toBe('completed');
  }

  async function approveAndComplete(): Promise<{ paymentId: number; receiptNumber: string }> {
    const paymentId = await createProcessingPayment();
    const approved = await approvePayment(paymentId);
    expect(approved.status, approved.text).toBe(200);
    const rows = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    const receiptNumber = rows[0]!.receipt_number;
    await completePdf(paymentId, receiptNumber);
    return { paymentId, receiptNumber };
  }

  it('GET receipt pre_system: 200 available:false, nunca 409', async () => {
    const paymentId = await createProcessingPayment();
    const res = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(res.status, res.text).toBe(200);
    expect(res.body).toEqual({ available: false, reason: 'pre_system' });
  });

  it('GET receipt pending: 202 + número; GET pdf: 404', async () => {
    const paymentId = await createProcessingPayment();
    await approvePayment(paymentId);
    const rows = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );

    const receipt = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(202);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'pending',
      receiptNumber: rows[0]!.receipt_number,
    });

    const pdf = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(404);
  });

  it('GET receipt ready: 200 + receipt + pdfUrl; GET pdf: 200 bytes', async () => {
    const { paymentId, receiptNumber } = await approveAndComplete();

    const receipt = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(200);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'ready',
      receiptNumber,
      pdfUrl: `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    });
    expect(receipt.body.receipt.document.number).toBe(receiptNumber);
    expect(receipt.body.receipt.document.type).toBe('receipt');

    const pdf = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
  });

  it('GET receipt/pdf pago inexistente: 404', async () => {
    const receipt = await admin.client.get(
      `/api/platform/subscriptions/payments/999999999/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(404);
    const pdf = await admin.client.get(
      `/api/platform/subscriptions/payments/999999999/receipt/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(404);
  });

  it('resend pending: 202 queued:false; resend ready: 200 queued+attachment', async () => {
    const pendingId = await createProcessingPayment();
    await approvePayment(pendingId);
    resetSpies(admin.client);

    const pending = await admin.client.post(
      `/api/platform/subscriptions/payments/${pendingId}/resend`,
      {},
    );
    expect(pending.status, pending.text).toBe(202);
    expect(pending.body).toMatchObject({ success: true, queued: false, pdfStatus: 'pending' });

    const { paymentId, receiptNumber } = await approveAndComplete();
    resetSpies(admin.client);
    const ready = await admin.client.post(
      `/api/platform/subscriptions/payments/${paymentId}/resend`,
      {},
    );
    expect(ready.status, ready.text).toBe(200);
    expect(ready.body).toMatchObject({ success: true, queued: true, attachment: true });
    const emails = admin.client.queue.ofType('email.org_payment_received');
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ paymentId, organizationId: tenant.organization.id });
    expect(receiptNumber).toMatch(/^FS-\d{7,}$/);
  });

  it('resend pre_system: 200 available:false sin encolar', async () => {
    const paymentId = await createProcessingPayment();
    resetSpies(admin.client);
    const res = await admin.client.post(
      `/api/platform/subscriptions/payments/${paymentId}/resend`,
      {},
    );
    expect(res.status, res.text).toBe(200);
    expect(res.body).toEqual({ success: true, available: false, reason: 'pre_system' });
    expect(admin.client.queue.ofType('email.org_payment_received')).toHaveLength(0);
  });

  it('resend sin destinatarios: 422 PAYER_EMAIL_MISSING', async () => {
    // Tenant dedicado: borrar sus owners deja el pago sin recipients.
    const lonely = await createGymTenant('c3-lonely');
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: lonely.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    const paymentId = Number(rows[0]!.id);
    await testQuery(`DELETE FROM member WHERE organization_id = $1`, [
      lonely.organization.id,
    ]);

    const denied = await admin.client.post(
      `/api/platform/subscriptions/payments/${paymentId}/resend`,
      {},
    );
    expect(denied.status, denied.text).toBe(422);
  });

  it('RBAC: support lee (GET 200) pero no reenvía (403); sin sesión 401', async () => {
    const { paymentId } = await approveAndComplete();
    // Pago pendiente aparte: el R2 spy es por-cliente, así que el 404 aquí
    // prueba permiso (no 403) sin depender del objeto de otro spy.
    const pendingId = await createProcessingPayment();
    await approvePayment(pendingId);
    const support = await registerPlatformUser('support');

    const receipt = await support.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(200);

    const pdf = await support.client.get(
      `/api/platform/subscriptions/payments/${pendingId}/receipt/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(404);

    const resend = await support.client.post(
      `/api/platform/subscriptions/payments/${paymentId}/resend`,
      {},
    );
    expect(resend.status, resend.text).toBe(403);

    const anon = createClient();
    const noAuth = await anon.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(noAuth.status, noAuth.text).toBe(401);
  });

  it('$0 trial: GET pre_system terminal (SKIP no quema serie)', async () => {
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
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    const receipt = await admin.client.get(
      `/api/platform/subscriptions/payments/${Number(rows[0]!.id)}/receipt`,
    );
    expect(receipt.status, receipt.text).toBe(200);
    expect(receipt.body).toEqual({ available: false, reason: 'pre_system' });
  });
});
