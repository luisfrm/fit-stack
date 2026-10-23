/**
 * Receipt claim sweep integration tests (RD-140).
 *
 * Step 1 CLAIMS the payment (`receipt_claim_at`) before consuming the
 * sequence. If the emission dies between the claim and the attach, the row
 * keeps a claim and no number. This suite covers the recovery path:
 *
 * - a stale claim (> 15 min) of BOTH issuers is resumed with a valid number
 *   and a `receipt.render` event carrying that persisted number;
 * - a fresh claim is left alone (the owner may still be running);
 * - once numbered, the row is never resumed again (no renumber).
 *
 * The sweep is global (it does not filter by org), so assertions are by
 * presence of the payment id, not by exact batch size.
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
  createGymMember,
  createPlan,
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import { sweepPendingReceiptPdfs, type SweepEnv } from '../../../jobs-worker/src/handlers/receipt.handler';
import { createDb } from '@workspace/database/factory';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import { formatConsoleReceiptNumber } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipt claim sweep', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('claim-sweep');
    plan = await createPlatformPlan();
  });

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

  /** Panel tenant + member + plan + validated payment via HTTP (step 1 runs). */
  async function createPanelPayment() {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const planRow = await createPlan(owner.client, { price: 10000, currency: 'USD' });
    const res = await owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: planRow.id,
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
    const rows = await testQuery<{ id: number; receipt_number: string | null }>(
      `SELECT id, receipt_number FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    expect(rows[0]!.receipt_number).not.toBeNull();
    return { owner, organization, paymentId: Number(rows[0]!.id) };
  }

  /**
   * Simulates the crash: erases the number + PDF and leaves a claim of the
   * given age (the emission died after claiming, before numbering).
   */
  async function leaveStaleClaim(paymentId: number, ageMinutes: number) {
    await testQuery(
      `UPDATE payment
         SET receipt_number = NULL,
             receipt_issued_at = NULL,
             receipt_pdf_key = NULL,
             receipt_notified_at = NULL,
             receipt_claim_at = now() - ($1 || ' minutes')::interval
       WHERE id = $2`,
      [String(ageMinutes), paymentId],
    );
  }

  it('resumes a stale panel claim with a number and enqueues the render', async () => {
    const { owner, organization, paymentId } = await createPanelPayment();
    await leaveStaleClaim(paymentId, 30);
    resetSpies(owner.client);

    const { resumed } = await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(resumed).toBeGreaterThanOrEqual(1);

    const rows = await testQuery<{
      receipt_number: string | null;
      receipt_issued_at: string | null;
      receipt_claim_at: string | null;
    }>(
      `SELECT receipt_number, receipt_issued_at, receipt_claim_at FROM payment WHERE id = $1`,
      [paymentId],
    );
    const persisted = rows[0]!;
    expect(persisted.receipt_number).toMatch(/^\d{4}-\d{6,}$/);
    expect(persisted.receipt_issued_at).not.toBeNull();
    // The claim is kept: it is the evidence that this row was numbered by the
    // recovery path, and it prevents a second resume.
    expect(persisted.receipt_claim_at).not.toBeNull();

    const renders = owner.client.receiptQueue
      .ofType('receipt.render')
      .filter((event) => event['paymentId'] === paymentId);
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      scope: 'panel',
      paymentId,
      organizationId: organization.id,
      receiptNumber: persisted.receipt_number,
    });
  });

  it('does not resume a fresh claim (the owner may still be running)', async () => {
    const { owner, paymentId } = await createPanelPayment();
    await leaveStaleClaim(paymentId, 1);
    resetSpies(owner.client);

    await sweepPendingReceiptPdfs(sweepEnv(owner.client));

    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!.receipt_number).toBeNull();
    expect(
      owner.client.receiptQueue
        .ofType('receipt.render')
        .filter((event) => event['paymentId'] === paymentId),
    ).toHaveLength(0);
  });

  it('does not number a stale claim whose payment was compensated to voided', async () => {
    const { owner, paymentId } = await createPanelPayment();
    await leaveStaleClaim(paymentId, 30);
    // RD-155 compensation: the emission failed before numbering, so the charge
    // was voided. The claim stays; numbering it would be a voided receipt
    // without an ANULADO artifact — not a legal state.
    await testQuery(`UPDATE payment SET status = 'voided' WHERE id = $1`, [paymentId]);
    resetSpies(owner.client);

    await sweepPendingReceiptPdfs(sweepEnv(owner.client));

    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!.receipt_number).toBeNull();
    expect(
      owner.client.receiptQueue
        .ofType('receipt.render')
        .filter((event) => event['paymentId'] === paymentId),
    ).toHaveLength(0);
  });

  it('does not resume a row twice (never renumbers)', async () => {
    const { owner, paymentId } = await createPanelPayment();
    await leaveStaleClaim(paymentId, 30);
    resetSpies(owner.client);
    await sweepPendingReceiptPdfs(sweepEnv(owner.client));

    const first = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(first[0]!.receipt_number).not.toBeNull();

    resetSpies(owner.client);
    const { resumed } = await sweepPendingReceiptPdfs(sweepEnv(owner.client));
    expect(resumed).toBe(0);

    const second = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(second[0]!.receipt_number).toBe(first[0]!.receipt_number);
  });

  it('does not number a platform claim whose payment was voided before the attach', async () => {
    const { organization } = await createGymTenant();
    const created = await admin.client.post('/api/platform/subscriptions', {
      organizationId: organization.id,
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
    expect(created.status, created.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [created.body.id],
    );
    const paymentId = Number(rows[0]!.id);

    // A stale claim on a validated row (the sweep window).
    await testQuery(
      `UPDATE platform_subscription_payment
         SET status = 'validated',
             receipt_number = NULL,
             receipt_claim_at = now() - interval '30 minutes'
       WHERE id = $1`,
      [paymentId],
    );

    const repo = createPlatformReceiptsRepository(createDb(TEST_DATABASE_URL));
    const seq = await repo.nextPlatformDocumentNumber('receipt');
    const receiptNumber = formatConsoleReceiptNumber(seq);

    // The sweep already read the claim; the charge is voided before the attach.
    await testQuery(
      `UPDATE platform_subscription_payment SET status = 'voided' WHERE id = $1`,
      [paymentId],
    );

    const attached = await repo.attachPlatformReceiptNumber(paymentId, {
      receiptNumber,
      receiptIssuedAt: new Date(),
    });
    expect(attached.status).toBe('voided');
    expect(attached.receiptNumber).toBeNull();
    // Nothing was persisted → the local (global) correlative is releasable.
    expect(await repo.releaseLastPlatformNumber('receipt', seq)).toEqual({
      released: true,
    });
  });

  it('resumes a stale platform claim with a global FS- number', async () => {
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
    const created = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    const paymentId = Number(created[0]!.id);

    // Crash simulation: the row was claimed by an emission that never numbered
    // it (`validated` is required for the claim, not for the sweep).
    await testQuery(
      `UPDATE platform_subscription_payment
         SET status = 'validated',
             receipt_number = NULL,
             receipt_issued_at = NULL,
             receipt_pdf_key = NULL,
             receipt_notified_at = NULL,
             receipt_claim_at = now() - interval '30 minutes'
       WHERE id = $1`,
      [paymentId],
    );
    resetSpies(admin.client);

    const { resumed } = await sweepPendingReceiptPdfs(sweepEnv(admin.client));
    expect(resumed).toBeGreaterThanOrEqual(1);

    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    const receiptNumber = rows[0]!.receipt_number;
    expect(receiptNumber).toMatch(/^FS-\d{7,}$/);

    const renders = admin.client.receiptQueue
      .ofType('receipt.render')
      .filter((event) => event['paymentId'] === paymentId);
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({
      scope: 'platform',
      paymentId,
      receiptNumber,
    });
  });
});
