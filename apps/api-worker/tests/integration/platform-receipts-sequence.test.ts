/**
 * Platform receipts sequence integration tests (C1).
 *
 * Covers: atomic global allocation under concurrency (including the
 * first-receipt race with no prior row), `FS-0000001` formatting from
 * shared (Fase 0), idempotent attach (`WHERE receipt_number IS NULL`),
 * global uniqueness of receipt_number, NULL legacy payments coexisting,
 * and invalid input errors.
 *
 * The platform payment fixture is created via HTTP
 * (POST /api/platform/subscriptions); the sequence repo — which has no
 * route in C1 — is exercised directly (precedent: receipts-sequence).
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
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import { createDb } from '@workspace/database/factory';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import { formatConsoleReceiptNumber } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Platform receipts sequence (C1)', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('c1');
    plan = await createPlatformPlan();
  });

  function platformRepo() {
    return createPlatformReceiptsRepository(createDb(TEST_DATABASE_URL));
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

  /** Platform subscription with a `processing` payment via HTTP (el repo
   *  attach no exige estado; `processing` evita el paso 1 automático de C2
   *  para probar el repo en aislamiento). */
  async function createPaidPlatformPayment(): Promise<number> {
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
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
    expect(rows[0]?.id).toBeDefined();
    return Number(rows[0]!.id);
  }

  it('N concurrent calls → unique consecutive numbers 1..N (no prior row)', async () => {
    const repo = platformRepo();
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () => repo.nextPlatformDocumentNumber('receipt')),
    );
    expect([...results].sort((a, b) => a - b)).toEqual(
      Array.from({ length: N }, (_, i) => i + 1),
    );
  });

  it('usa el formato Console de Fase 0 como contrato (FS-0000001)', () => {
    expect(formatConsoleReceiptNumber(1)).toBe('FS-0000001');
    expect(formatConsoleReceiptNumber(42)).toBe('FS-0000042');
  });

  it('attach numbers a payment and re-attach is idempotent (no renumber)', async () => {
    // 101+ deliberado: fuera del rango 1..N del test de concurrencia.
    const repo = platformRepo();
    const paymentId = await createPaidPlatformPayment();

    const first = await repo.attachPlatformReceipt(paymentId, {
      receiptNumber: formatConsoleReceiptNumber(101),
      receiptIssuedAt: new Date(),
    });
    expect(first.receiptNumber).toBe('FS-0000101');

    const second = await repo.attachPlatformReceipt(paymentId, {
      receiptNumber: formatConsoleReceiptNumber(102),
      receiptIssuedAt: new Date(),
    });
    expect(second.receiptNumber).toBe('FS-0000101');
  });

  it('legacy payments without number coexist (NULL = pre_system)', async () => {
    const paymentId = await createPaidPlatformPayment();
    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]?.receipt_number).toBeNull();
  });

  it('mismo FS- en dos pagos → viola el unique global (23505)', async () => {
    const repo = platformRepo();
    const firstId = await createPaidPlatformPayment();
    const secondId = await createPaidPlatformPayment();
    await repo.attachPlatformReceipt(firstId, {
      receiptNumber: formatConsoleReceiptNumber(200),
      receiptIssuedAt: new Date(),
    });

    let duplicateErr: unknown;
    try {
      await repo.attachPlatformReceipt(secondId, {
        receiptNumber: formatConsoleReceiptNumber(200),
        receiptIssuedAt: new Date(),
      });
    } catch (e) {
      duplicateErr = e;
    }
    expect(duplicateErr).toBeDefined();
    const cause = (duplicateErr as { cause?: { code?: string; message?: string } })
      ?.cause ?? (duplicateErr as { code?: string; message?: string });
    expect(`${cause?.code ?? ''} ${cause?.message ?? duplicateErr}`).toMatch(
      /23505|duplicate|unique/i,
    );
  });

  it('rejects invalid document type, bad format and unknown payment', async () => {
    const repo = platformRepo();
    await expect(repo.nextPlatformDocumentNumber('ticket' as never)).rejects.toThrow(
      /document_type inválido/,
    );
    const paymentId = await createPaidPlatformPayment();
    await expect(
      repo.attachPlatformReceipt(paymentId, {
        receiptNumber: 'nope-1',
        receiptIssuedAt: new Date(),
      }),
    ).rejects.toThrow(/formato inválido/);
    await expect(
      repo.attachPlatformReceipt(999999999, {
        receiptNumber: formatConsoleReceiptNumber(103),
        receiptIssuedAt: new Date(),
      }),
    ).rejects.toThrow(/no existe/);
  });
});
