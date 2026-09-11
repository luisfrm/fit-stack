/**
 * Receipts sequence integration tests (Fase 1).
 *
 * Covers: atomic sequence allocation under concurrency (including the
 * first-receipt-of-the-year race with no prior row), idempotent attach,
 * per-org uniqueness of receipt_number, NULL legacy payments coexisting,
 * and void preserving the number.
 *
 * The payment fixture is created via HTTP (POST /api/subscriptions);
 * the sequence repo — which has no route in Fase 1 — is exercised
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
import { createReceiptsRepository } from '../../src/repositories/receipts.repository';

describe.skipIf(skipReason !== null)('Receipts sequence (Fase 1)', () => {
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
        status: 'validated',
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

  it('second attachReceipt on a numbered payment returns the existing one', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    const first = await repo.attachReceipt(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000001`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    const second = await repo.attachReceipt(paymentId, organization.id, {
      receiptNumber: `${organization.slug}-2026-000099`,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(first.receiptNumber).toBe(`${organization.slug}-2026-000001`);
    expect(second.receiptNumber).toBe(first.receiptNumber);
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
          status: 'validated',
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
    await repo.attachReceipt(paymentA, organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    // Duplicate in the SAME org must fail on the partial UNIQUE index
    // (the UPDATE itself collides; the row belongs to this org).
    // Assert the PG cause (23505 / constraint name), not just any error:
    // the Neon HTTP driver surfaces it on `error.cause`, not `message`.
    let duplicateErr: unknown;
    try {
      await repo.attachReceipt(paymentB, organization.id, {
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
    await repo.attachReceipt(a.paymentId, a.organization.id, {
      receiptNumber: num,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    // Same number string in org B inserts fine (UNIQUE is per-org).
    const attachedB = await repo.attachReceipt(b.paymentId, b.organization.id, {
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
      repo.attachReceipt(a.paymentId, b.organization.id, {
        receiptNumber: `${b.organization.slug}-2026-000031`,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
      }),
    ).rejects.toThrow(/no encontrado/);
    await expect(
      repo.markVoided(a.paymentId, b.organization.id, {
        by: 'user-actor-1',
        reason: 'intento cross-org',
      }),
    ).rejects.toThrow(/no encontrado/);
  });

  it('markVoided preserves the number and sets flags', async () => {
    const { organization, paymentId } = await createPaidFixture();
    const repo = receiptsRepo();
    const num = `${organization.slug}-2026-000020`;
    await repo.attachReceipt(paymentId, organization.id, {
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
});
