/**
 * Panel document sequence + receipt columns integration tests.
 *
 * Covers the Fase 1 contract: atomic correlative numbering per organization /
 * document type / year (safe under concurrency and without interactive
 * transactions), idempotent number assignment, per-org uniqueness, voided
 * receipts keeping their number, and legacy payments staying NULL.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@workspace/database/factory';
import { formatPanelReceiptNumber } from '@workspace/shared';
import { assertSchemaReady, skipReason, testQuery, truncateAll, TEST_DATABASE_URL } from '../helpers/db';
import {
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';
import { createReceiptsRepository } from '../../src/repositories/receipts.repository';

describe.skipIf(skipReason !== null)('Panel document sequence and receipts', () => {
  let tenant: GymTenant;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    tenant = await createGymTenant();
  });

  function repo() {
    return createReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  async function createValidatedPayment(): Promise<number> {
    const plan = await createPlan(tenant.owner.client);
    const member = await createGymMember(tenant.owner.client);

    const res = await tenant.owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 50,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    if (res.status !== 201) {
      throw new Error(`create subscription failed (${res.status}): ${res.text}`);
    }

    const rows = await testQuery<{ id: string }>(
      `SELECT id FROM payment WHERE organization_id = $1 AND member_id = $2 ORDER BY id DESC LIMIT 1`,
      [tenant.organization.id, member.id],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('payment not found after subscription create');
    return Number(id);
  }

  async function readPayment(paymentId: number) {
    const rows = await testQuery<{
      receipt_number: string | null;
      receipt_voided: boolean;
      voided_by: string | null;
      void_reason: string | null;
      document_type: string;
    }>(
      `SELECT receipt_number, receipt_voided, voided_by, void_reason, document_type
       FROM payment WHERE id = $1`,
      [paymentId],
    );
    return rows[0]!;
  }

  it('generates unique consecutive numbers under concurrency (first-of-year race)', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 12 }, () =>
        repo().nextDocumentNumber({
          organizationId: tenant.organization.id,
          documentType: 'receipt',
          year: 2030,
        }),
      ),
    );

    expect(new Set(numbers).size).toBe(12);
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  it('keeps an independent sequence per year', async () => {
    const r = repo();

    expect(
      await r.nextDocumentNumber({ organizationId: tenant.organization.id, documentType: 'receipt', year: 2031 }),
    ).toBe(1);
    expect(
      await r.nextDocumentNumber({ organizationId: tenant.organization.id, documentType: 'receipt', year: 2032 }),
    ).toBe(1);
    expect(
      await r.nextDocumentNumber({ organizationId: tenant.organization.id, documentType: 'receipt', year: 2031 }),
    ).toBe(2);
  });

  it('attaches a receipt number + tax breakdown idempotently', async () => {
    const paymentId = await createValidatedPayment();
    const sequence = await repo().nextDocumentNumber({
      organizationId: tenant.organization.id,
      documentType: 'receipt',
      year: 2026,
    });
    const receiptNumber = formatPanelReceiptNumber(tenant.organization.slug, 2026, sequence);

    const first = await repo().attachReceipt(tenant.organization.id, paymentId, {
      receiptNumber,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
      subtotal: 50,
      taxTotal: 0,
      taxDetails: [],
    });
    expect(first).toEqual({ id: paymentId, receiptNumber });

    const second = await repo().attachReceipt(tenant.organization.id, paymentId, {
      receiptNumber: formatPanelReceiptNumber(tenant.organization.slug, 2026, sequence + 1),
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(second).toBeNull();

    const row = await readPayment(paymentId);
    expect(row.receipt_number).toBe(receiptNumber);
    expect(row.document_type).toBe('receipt');
  });

  it('enforces unique receipt numbers per organization', async () => {
    const first = await createValidatedPayment();
    const second = await createValidatedPayment();
    const receiptNumber = formatPanelReceiptNumber(tenant.organization.slug, 2027, 1);

    const attached = await repo().attachReceipt(tenant.organization.id, first, {
      receiptNumber,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });
    expect(attached).not.toBeNull();

    await expect(
      repo().attachReceipt(tenant.organization.id, second, {
        receiptNumber,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('voids a receipt keeping its number and recording the audit actor', async () => {
    const paymentId = await createValidatedPayment();
    const receiptNumber = formatPanelReceiptNumber(tenant.organization.slug, 2028, 1);
    await repo().attachReceipt(tenant.organization.id, paymentId, {
      receiptNumber,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });

    const voided = await repo().markVoided(tenant.organization.id, paymentId, {
      by: 'user_test',
      reason: 'Pago revertido por el banco',
    });
    expect(voided).toEqual({ id: paymentId });

    const row = await readPayment(paymentId);
    expect(row.receipt_number).toBe(receiptNumber);
    expect(row.receipt_voided).toBe(true);
    expect(row.voided_by).toBe('user_test');
    expect(row.void_reason).toBe('Pago revertido por el banco');
  });

  it('keeps legacy payments valid with a NULL receipt number', async () => {
    const paymentId = await createValidatedPayment();
    const row = await readPayment(paymentId);

    expect(row.receipt_number).toBeNull();
    expect(row.receipt_voided).toBe(false);
    expect(row.document_type).toBe('receipt');
  });
});
