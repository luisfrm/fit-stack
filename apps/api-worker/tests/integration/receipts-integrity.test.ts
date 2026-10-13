/**
 * Receipt correlative integrity (C0).
 *
 * Covers the regression that motivated C0: a failure in step 1 AFTER consuming
 * the sequence burned a correlative → a permanent, unexplained hole in the
 * audit report. And the double-emission race (two concurrent PATCHes
 * on the same payment) had to ALWAYS leave a single persisted number.
 *
 * The payment is created as `processing` (no automatic emission) and validated via
 * SQL: this way `POST /api/payments/:id/issue` walks the real emission path without
 * depending on the approval endpoint.
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
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
} from '../helpers/auth';
import type { createClient } from '../helpers/client';
import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import { toLocalDayString } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipts correlative integrity (C0)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Issuer's local year (same criterion as step 1). */
  function localYear(): number {
    return Number(toLocalDayString('America/Caracas', new Date()).slice(0, 4));
  }

  function receiptsRepo() {
    return createReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  function platformReceiptsRepo() {
    return createPlatformReceiptsRepository(createDb(TEST_DATABASE_URL));
  }

  /** Last number reserved by the org in the local year (0 if there is no row). */
  async function sequenceState(orgId: string): Promise<number> {
    const rows = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence
        WHERE organization_id = $1 AND document_type = 'receipt' AND year = $2`,
      [orgId, localYear()],
    );
    return Number(rows[0]?.last_number ?? 0);
  }

  /** Member + plan + `processing` payment (no automatic emission). */
  async function createProcessingPayment(
    client: ReturnType<typeof createClient>,
  ): Promise<number> {
    const member = await createGymMember(client);
    const plan = await createPlan(client, { price: 10000, currency: 'USD' });
    const res = await client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
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
    return Number(rows[0]!.id);
  }

  /** Validates the payment via SQL (bypasses the approval endpoint). */
  async function markValidated(paymentId: number): Promise<void> {
    await testQuery(`UPDATE payment SET status = 'validated' WHERE id = $1`, [paymentId]);
  }

  it('releaseLastNumber libera solo si sigue siendo el último consumidor', async () => {
    const { organization } = await createGymTenant('release');
    const repo = receiptsRepo();
    const year = localYear();

    const first = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    // Released: the sequence goes back and the number is REUSED (it is not burned).
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, first)).toEqual({
      released: true,
    });
    const reused = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    expect(reused).toBe(first);

    const second = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    expect(second).toBe(first + 1);
    // The first is no longer the last: going back would reassign a live number.
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, first)).toEqual({
      released: false,
    });
    expect(await repo.releaseLastNumber(organization.id, 'receipt', year, second)).toEqual({
      released: true,
    });
    expect(await sequenceState(organization.id)).toBe(first);
  });

  it('releaseLastPlatformNumber cumple el mismo contrato en la serie global', async () => {
    const repo = platformReceiptsRepo();

    const first = await repo.nextPlatformDocumentNumber('receipt');
    expect(await repo.releaseLastPlatformNumber('receipt', first)).toEqual({
      released: true,
    });
    const reused = await repo.nextPlatformDocumentNumber('receipt');
    expect(reused).toBe(first);

    const second = await repo.nextPlatformDocumentNumber('receipt');
    expect(second).toBe(first + 1);
    expect(await repo.releaseLastPlatformNumber('receipt', first)).toEqual({
      released: false,
    });
    expect(await repo.releaseLastPlatformNumber('receipt', second)).toEqual({
      released: true,
    });
  });

  it('fallo fiscal NO quema correlativo: sin número, sin huecos', async () => {
    const { owner, organization } = await createGymTenant('fiscal-fail');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    // Unknown fiscal country → `resolveFiscalProfile` throws (no fallback).
    await testQuery(`UPDATE organization SET country_code = 'XX' WHERE id = $1`, [
      organization.id,
    ]);

    const res = await owner.client.post(`/api/payments/${paymentId}/issue`, {});
    expect(res.status).toBeGreaterThanOrEqual(400);

    // The point of C0: not a consumed number nor a hole in the audit.
    expect(await sequenceState(organization.id)).toBe(0);
    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!.receipt_number).toBeNull();

    const report = await owner.client.get('/api/reports/receipts', {
      query: { status: 'gaps' },
    });
    expect(report.status, report.text).toBe(200);
    expect((report.body as { gaps: unknown[] }).gaps).toEqual([]);
  });

  it('doble emisión concurrente del mismo pago → un solo número persistido', async () => {
    const { owner, organization } = await createGymTenant('race');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    const [a, b] = await Promise.all([
      owner.client.post(`/api/payments/${paymentId}/issue`, {}),
      owner.client.post(`/api/payments/${paymentId}/issue`, {}),
    ]);
    expect(a.status, a.text).toBe(200);
    expect(b.status, b.text).toBe(200);

    const rows = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    const persisted = rows[0]!.receipt_number;
    expect(persisted).toMatch(
      new RegExp(`^\\d{4}-\\d{6}$`),
    );
    // Both report the persisted AUTHORITATIVE number, never a lost local one.
    expect(a.body.receiptNumber).toBe(persisted);
    expect(b.body.receiptNumber).toBe(persisted);

    const numbered = await testQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM payment
        WHERE organization_id = $1 AND receipt_number IS NOT NULL`,
      [organization.id],
    );
    expect(Number(numbered[0]!.count)).toBe(1);
  });
});
