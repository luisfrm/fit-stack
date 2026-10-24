/**
 * Org-scoped SaaS receipts (RD-151).
 *
 * The gym consumes its OWN `FS-N` receipts from the panel session:
 * `GET /api/organizations/receipts` lists only its payments, and the
 * 3-state contract (`200 ready` / `202 pending` / `200 available:false
 * pre_system`) plus the binary download mirror the platform contract. A
 * payment belonging to ANOTHER organization answers `404` on both the
 * state and the PDF endpoint (existence is never revealed).
 *
 * HTTP real against the Hono app + Neon branch; the PDF renderer is stubbed.
 * Step 1 (numbering) is exercised by the `platform-receipts-*` suites, so
 * here the number is written directly: this file is about ACCESS and the
 * contract shape, not about the correlative.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../jobs-worker/src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
}));

import type { TestClient } from '../helpers/client';
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

describe.skipIf(skipReason !== null)('Organization receipts (panel)', () => {
  let admin: AuthedUser;
  let tenantA: Awaited<ReturnType<typeof createGymTenant>>;
  let tenantB: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenantA = await createGymTenant('org-a');
    tenantB = await createGymTenant('org-b');

    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
    });
    expect(res.status, res.text).toBe(201);
    plan = res.body;
  });

  function jobsEnv(client: TestClient): ReceiptHandlerEnv {
    const env = client.env;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  /** Platform subscription with a `processing` payment for `organizationId`. */
  async function createProcessingPayment(organizationId: string): Promise<number> {
    admin.client.queue.reset();
    admin.client.receiptQueue.reset();
    admin.client.r2.reset();

    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId,
      planId: plan.id,
      startDate: isoDate(-30),
      payment: {
        currencyPaid: 'USD',
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'processing',
        paymentDate: isoDate(-30),
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
   * Persists a number directly (single statement, no correlative table).
   * `FS-` + 7 digits as the real series, unique per call.
   */
  async function numberDirectly(paymentId: number): Promise<string> {
    const receiptNumber = `FS-${String(Date.now() % 9_000_000 + 1_000_000)}`;
    await testQuery(
      `UPDATE platform_subscription_payment
          SET receipt_number = $1,
              receipt_issued_at = now(),
              status = 'validated',
              subtotal = amount_paid,
              tax_total = 0,
              tax_details = '[]'::jsonb
        WHERE id = $2`,
      [receiptNumber, paymentId],
    );
    return receiptNumber;
  }

  /** Renders step 2 so the receipt reaches the `ready` state (PDF in R2). */
  async function renderPdf(
    client: TestClient,
    paymentId: number,
    organizationId: string,
    receiptNumber: string,
  ): Promise<void> {
    const result = await handlePlatformReceiptRender(jobsEnv(client), {
      type: 'receipt.render',
      scope: 'platform',
      paymentId,
      organizationId,
      receiptNumber,
    });
    expect(result).toBe('completed');
  }

  it('lists the own payments only, never another organization', async () => {
    const paymentA = await createProcessingPayment(tenantA.organization.id);
    const paymentB = await createProcessingPayment(tenantB.organization.id);

    const listA = await tenantA.owner.client.get('/api/organizations/receipts');
    expect(listA.status, listA.text).toBe(200);
    const idsA = (listA.body.payments as Array<{ id: number }>).map((p) => p.id);
    expect(idsA).toContain(paymentA);
    expect(idsA).not.toContain(paymentB);

    const listB = await tenantB.owner.client.get('/api/organizations/receipts');
    expect(listB.status, listB.text).toBe(200);
    const idsB = (listB.body.payments as Array<{ id: number }>).map((p) => p.id);
    expect(idsB).toContain(paymentB);
    expect(idsB).not.toContain(paymentA);
  });

  it('walks the 3 states: pre_system, pending 202, ready + pdf', async () => {
    const paymentId = await createProcessingPayment(tenantA.organization.id);
    const client = tenantA.owner.client;

    // Not numbered yet: pre_system, never 409.
    const preSystem = await client.get(`/api/organizations/receipts/${paymentId}`);
    expect(preSystem.status, preSystem.text).toBe(200);
    expect(preSystem.body).toEqual({ available: false, reason: 'pre_system' });

    const receiptNumber = await numberDirectly(paymentId);

    // Numbered, PDF still rendering: 202 and no download yet.
    const pending = await client.get(`/api/organizations/receipts/${paymentId}`);
    expect(pending.status, pending.text).toBe(202);
    expect(pending.body).toMatchObject({
      available: true,
      pdfStatus: 'pending',
      receiptNumber,
    });

    const pendingPdf = await client.get(`/api/organizations/receipts/${paymentId}/pdf`);
    expect(pendingPdf.status, pendingPdf.text).toBe(404);

    await renderPdf(client, paymentId, tenantA.organization.id, receiptNumber);

    const ready = await client.get(`/api/organizations/receipts/${paymentId}`);
    expect(ready.status, ready.text).toBe(200);
    expect(ready.body).toMatchObject({
      available: true,
      pdfStatus: 'ready',
      receiptNumber,
      pdfUrl: `/api/organizations/receipts/${paymentId}/pdf`,
    });

    const pdf = await client.get(`/api/organizations/receipts/${paymentId}/pdf`);
    expect(pdf.status, pdf.text).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
  });

  it('answers 404 for a payment of another organization', async () => {
    const paymentId = await createProcessingPayment(tenantA.organization.id);
    const receiptNumber = await numberDirectly(paymentId);
    await renderPdf(tenantA.owner.client, paymentId, tenantA.organization.id, receiptNumber);

    // Tenant B owns neither the payment nor its receipt, even when READY.
    const state = await tenantB.owner.client.get(`/api/organizations/receipts/${paymentId}`);
    expect(state.status, state.text).toBe(404);

    const pdf = await tenantB.owner.client.get(
      `/api/organizations/receipts/${paymentId}/pdf`,
    );
    expect(pdf.status, pdf.text).toBe(404);
  });

  it('requires a session (401 without cookies)', async () => {
    const res = await tenantA.owner.client.get('/api/organizations/receipts', {
      anonymous: true,
    });
    expect(res.status, res.text).toBe(401);
  });
});
