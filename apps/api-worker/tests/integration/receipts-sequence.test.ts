/**
 * Receipts sequence integration tests.
 *
 * Covers: atomic sequence allocation under concurrency (including the
 * first-receipt-of-the-year race with no prior row), idempotent number attach
 * on a CLAIMED row, per-org uniqueness of receipt_number, NULL legacy payments
 * coexisting, and void preserving the number.
 *
 * The payment fixture is created via HTTP (POST /api/subscriptions);
 * the sequence repo — which has no route — is exercised
 * directly (precedent: knowledge.test.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';
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
  isoDate,
} from '../helpers/auth';
import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';

describe.skipIf(skipReason !== null)('Receipts sequence', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Member + plan + validated payment via HTTP; returns the payment id. */
  async function createPaidFixture() {
    const { owner, organization } = await createGymTenant();
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
        // processing: no automatic emission (step 1); the attach repo does not require a status.
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    expect(rows[0]?.id).toBeDefined();
    return { owner, organization, paymentId: Number(rows[0]!.id) };
  }

  function receiptsRepo() {
    return createReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  /**
   * Marks the payment validated and CLAIMS it (the number is only attached to
   * a claimed row). Actor `null`: no session here, never fabricated.
   */
  async function claimForNumbering(paymentId: number, orgId: string): Promise<void> {
    await testQuery(`UPDATE payment SET status = 'validated' WHERE id = $1`, [paymentId]);
    const { claimed } = await receiptsRepo().claimReceipt(paymentId, orgId, {
      subtotal: 100,
      taxTotal: 0,
      taxDetails: [],
      emitterSnapshot: null,
      issuedBy: null,
    });
    expect(claimed).toBe(true);
  }

  it('N concurrent calls same org/year → unique consecutive numbers 1..N', async () => {
    const { organization } = await createGymTenant();
    const repo = receiptsRepo();
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        repo.nextDocumentNumber(organization.id, 'receipt', 2026),
      ),
    );
    const sorted = [...results].sort((a, b) => a - b);
    expect(new Set(results).size).toBe(N);
    expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it('first receipt of the year with no prior row → {1,2}', async () => {
    const { organization } = await createGymTenant();
    const repo = receiptsRepo();
    const [a, b] = await Promise.all([
      repo.nextDocumentNumber(organization.id, 'receipt', 2030),
      repo.nextDocumentNumber(organization.id, 'receipt', 2030),
    ]);
    expect([a, b].sort()).toEqual([1, 2]);
  });

  it('second attachReceiptNumber on a numbered payment returns the existing one', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    await claimForNumbering(paymentId, organization.id);
    const first = await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000001`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    const second = await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000099`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(first.receiptNumber).toBe(`${organization.slug}-2026-000001`);
    expect(second.receiptNumber).toBe(first.receiptNumber);
  });

  it('attachReceiptNumber never numbers an UNCLAIMED payment', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    await testQuery(`UPDATE payment SET status = 'validated' WHERE id = $1`, [paymentId]);
    // No claim: the UPDATE matches nothing and the re-read returns the row
    // without a number (never numbered without a claim).
    const row = await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000050`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(row.receiptNumber).toBeNull();
  });

  it('receipt_number unique per org; NULL legacy payments coexist', async () => {
    const { owner, organization } = await createGymTenant();
    const repo = receiptsRepo();

    async function createPaymentInOrg(): Promise<number> {
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
          // processing: no automatic emission (step 1); the attach repo does not require a status.
          status: 'processing',
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

    const paymentA = await createPaymentInOrg();
    const paymentB = await createPaymentInOrg();
    const num = `${organization.slug}-2026-000010`;
    await claimForNumbering(paymentA, organization.id);
    await repo.attachReceiptNumber(paymentA, organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    await claimForNumbering(paymentB, organization.id);
    // Duplicate in the SAME org must fail on the partial UNIQUE index
    // (the UPDATE itself collides; the row belongs to this org).
    // Assert the PG cause (23505 / constraint name), not just any error:
    // the Neon HTTP driver surfaces it on `error.cause`, not `message`.
    let duplicateErr: unknown;
    try {
      await repo.attachReceiptNumber(paymentB, organization.id, {
        receiptNumber: num,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
      });
    } catch (e) {
      duplicateErr = e;
    }
    expect(duplicateErr).toBeDefined();
    const cause = (duplicateErr as { cause?: { code?: string; message?: string } })
      ?.cause;
    expect(`${cause?.code ?? ''} ${cause?.message ?? ''}`).toMatch(
      /23505|duplicate|idx_payment_org_receipt_number/,
    );
    // Legacy payment without a number stays valid (NULL).
    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentB],
    );
    expect(rows[0]?.receipt_number).toBeNull();
  });

  it('same receipt_number in another org coexists; org scoping is enforced', async () => {
    const a = await createPaidFixture();
    const b = await createPaidFixture();
    const repo = receiptsRepo();
    const num = `${a.organization.slug}-2026-000030`;
    await claimForNumbering(a.paymentId, a.organization.id);
    await repo.attachReceiptNumber(a.paymentId, a.organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    // Same number string in org B inserts fine (UNIQUE is per-org).
    await claimForNumbering(b.paymentId, b.organization.id);
    const attachedB = await repo.attachReceiptNumber(b.paymentId, b.organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(attachedB.receiptNumber).toBe(num);
    // Reads are org-scoped: each org sees its own row.
    const foundA = await repo.findByReceiptNumber(a.organization.id, num);
    const foundB = await repo.findByReceiptNumber(b.organization.id, num);
    expect(foundA?.id).toBe(a.paymentId);
    expect(foundB?.id).toBe(b.paymentId);
    // Cross-org writes are rejected: payment of org A numbered under org B.
    await expect(
      repo.attachReceiptNumber(a.paymentId, b.organization.id, {
        receiptNumber: `${b.organization.slug}-2026-000031`,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
      }),
    ).rejects.toThrow(/no encontrado/);
    await expect(
      repo.claimReceipt(b.paymentId, a.organization.id, {
        subtotal: 100,
        taxTotal: 0,
        taxDetails: [],
        emitterSnapshot: null,
        issuedBy: null,
      }),
    ).resolves.toEqual({ claimed: false });
    await expect(
      repo.markVoided(a.paymentId, b.organization.id, {
        by: 'user-actor-1',
        reason: 'intento cross-org',
      }),
    ).rejects.toThrow(/no encontrado/);
  });

  it('claimReceipt only claims a validated payment AND only once', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    const claim = {
      subtotal: 100,
      taxTotal: 0,
      taxDetails: [],
      emitterSnapshot: null,
      issuedBy: 'user-1',
    };
    // Still `processing`: not claimable.
    expect(await repo.claimReceipt(paymentId, organization.id, claim)).toEqual({
      claimed: false,
    });
    await testQuery(`UPDATE payment SET status = 'validated' WHERE id = $1`, [paymentId]);
    expect(await repo.claimReceipt(paymentId, organization.id, claim)).toEqual({
      claimed: true,
    });
    // Second claim loses: the sequence is never consumed twice for one row.
    expect(await repo.claimReceipt(paymentId, organization.id, claim)).toEqual({
      claimed: false,
    });
  });

  it('markVoided preserves the number and sets flags', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    const num = `${organization.slug}-2026-000020`;
    await claimForNumbering(paymentId, organization.id);
    await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    const voided = await repo.markVoided(paymentId, organization.id, {
      by: 'user-actor-1',
      reason: 'cobro duplicado',
    });
    expect(voided.receiptVoided).toBe(true);
    expect(voided.receiptNumber).toBe(num);
    const found = await repo.findByReceiptNumber(organization.id, num);
    expect(found?.id).toBe(paymentId);
  });

  it('markVoided is idempotent at the storage layer (audit never rewritten)', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    await claimForNumbering(paymentId, organization.id);
    await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000021`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });

    const first = await repo.markVoided(paymentId, organization.id, {
      by: 'user-actor-1',
      reason: 'primera anulación',
    });
    // A second delivery (retry / concurrent) returns the stored row: the WHERE
    // requires `receipt_voided = false`, so the audit is never rewritten.
    const second = await repo.markVoided(paymentId, organization.id, {
      by: 'user-actor-2',
      reason: 'segunda anulación',
    });
    expect(second.voidedBy).toBe(first.voidedBy);
    expect(second.voidReason).toBe(first.voidReason);
    expect(second.voidedAt?.getTime()).toBe(first.voidedAt?.getTime());
  });

  it('flagVoidedIfMissing repairs a lost flag once, preserving the audit', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    await claimForNumbering(paymentId, organization.id);
    await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000022`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });

    // The void flow: the status change writes the audit first, the receipt
    // flag second. Here the second write is lost (injected failure).
    await testQuery(
      `UPDATE payment
          SET status = 'voided', voided_by = $1, voided_at = now(), void_reason = $2,
              receipt_voided = false
        WHERE id = $3`,
      ['user-actor-1', 'cobro duplicado', paymentId],
    );
    const before = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE id = $1`,
      [paymentId],
    );

    expect(await repo.flagVoidedIfMissing(paymentId, organization.id)).toEqual({
      flagged: true,
    });
    const repaired = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(repaired[0]!['receipt_voided']).toBe(true);
    // The repair flips ONLY the flag: actor, reason and instant are untouched.
    expect(repaired[0]!['voided_by']).toBe(before[0]!['voided_by']);
    expect(repaired[0]!['void_reason']).toBe(before[0]!['void_reason']);
    expect(new Date(repaired[0]!['voided_at'] as string).getTime()).toBe(
      new Date(before[0]!['voided_at'] as string).getTime(),
    );

    // Second run: nothing to repair, so nothing to render either.
    expect(await repo.flagVoidedIfMissing(paymentId, organization.id)).toEqual({
      flagged: false,
    });

    // A voided payment with NO number is terminal: never flagged (there is no
    // document to seal).
    const bare = await createPaidFixture();
    await testQuery(
      `UPDATE payment SET status = 'voided', voided_at = now(), void_reason = 'sin comprobante' WHERE id = $1`,
      [bare.paymentId],
    );
    expect(await repo.flagVoidedIfMissing(bare.paymentId, bare.organization.id)).toEqual({
      flagged: false,
    });
  });
});
