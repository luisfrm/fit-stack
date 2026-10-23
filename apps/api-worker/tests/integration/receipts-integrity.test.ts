/**
 * Receipt correlative integrity.
 *
 * Covers the regression this suite guards: a failure in step 1 AFTER consuming
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
import { toLocalDayString, formatPanelReceiptNumber } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Receipts correlative integrity', () => {
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

  it('fallo fiscal NO quema correlativo ni reclama el pago: sin número, sin huecos', async () => {
    const { owner, organization } = await createGymTenant('fiscal-fail');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    // Unknown fiscal country → `resolveFiscalProfile` throws (no fallback).
    await testQuery(`UPDATE organization SET country_code = 'XX' WHERE id = $1`, [
      organization.id,
    ]);

    const res = await owner.client.post(`/api/payments/${paymentId}/issue`, {});
    expect(res.status).toBeGreaterThanOrEqual(400);

    // The point: not a consumed number, no hole in the audit and no claim
    // left behind (the fiscal work runs before the claim).
    expect(await sequenceState(organization.id)).toBe(0);
    const rows = await testQuery<{
      receipt_number: string | null;
      receipt_claim_at: string | null;
    }>(`SELECT receipt_number, receipt_claim_at FROM payment WHERE id = $1`, [paymentId]);
    expect(rows[0]!.receipt_number).toBeNull();
    expect(rows[0]!.receipt_claim_at).toBeNull();

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
    // The loser never gets an error: it either re-reads the persisted number
    // (200) or reports the claim as in progress (202).
    for (const res of [a, b]) {
      expect([200, 202], res.text).toContain(res.status);
    }

    const rows = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    const persisted = rows[0]!.receipt_number;
    expect(persisted).toMatch(
      new RegExp(`^\\d{4}-\\d{6}$`),
    );
    // At least the winner reports the persisted AUTHORITATIVE number.
    const numbered = [a, b].filter((res) => res.status === 200);
    expect(numbered.length).toBeGreaterThanOrEqual(1);
    for (const res of numbered) {
      expect(res.body.receiptNumber).toBe(persisted);
    }
    for (const res of [a, b].filter((r) => r.status === 202)) {
      expect(res.body).toMatchObject({
        receiptNumber: null,
        pdfStatus: 'pending',
        inProgress: true,
      });
    }

    const numberedRows = await testQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM payment
        WHERE organization_id = $1 AND receipt_number IS NOT NULL`,
      [organization.id],
    );
    expect(Number(numberedRows[0]!.count)).toBe(1);
  });

  it('attachReceiptNumber NO numera un pago reclamado que dejó de estar validado (ventana claim→attach)', async () => {
    const { owner, organization } = await createGymTenant('attach-voided');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    const repo = receiptsRepo();
    const year = localYear();
    // Claim from a (future) emission that dies before numbering.
    expect(
      await repo.claimReceipt(paymentId, organization.id, {
        subtotal: 10000,
        taxTotal: 0,
        taxDetails: [],
        emitterSnapshot: null,
        issuedBy: null,
      }),
    ).toEqual({ claimed: true });

    // The sweep read the claim; the charge is then compensated to `voided`
    // (RD-155) before the attach. Numbering it would leave a voided document
    // without its sealed ANULADO artifact.
    await testQuery(`UPDATE payment SET status = 'voided' WHERE id = $1`, [paymentId]);

    const seq = await repo.nextDocumentNumber(organization.id, 'receipt', year);
    const receiptNumber = formatPanelReceiptNumber(year, seq);
    const row = await repo.attachReceiptNumber(paymentId, organization.id, {
      receiptNumber,
      documentType: 'receipt',
      receiptIssuedAt: new Date(),
    });

    // The row comes back unchanged (no number written) so the caller can
    // compensate: nothing was persisted, the number is still the last one.
    expect(row.status).toBe('voided');
    expect(row.receiptNumber).toBeNull();
    expect(
      await repo.releaseLastNumber(organization.id, 'receipt', year, seq),
    ).toEqual({ released: true });
    expect(await sequenceState(organization.id)).toBe(0);
  });

  it('claim perdido sin número → 202 pending (inProgress), nunca 409/500 ni número quemado', async () => {
    const { owner, organization } = await createGymTenant('claim-lost');
    const paymentId = await createProcessingPayment(owner.client);
    await markValidated(paymentId);

    // Simulates a concurrent emission that already claimed the row and has
    // not attached the number yet (a dead one is resumed by the sweep).
    await testQuery(`UPDATE payment SET receipt_claim_at = now() WHERE id = $1`, [paymentId]);

    const res = await owner.client.post(`/api/payments/${paymentId}/issue`, {});
    expect(res.status, res.text).toBe(202);
    expect(res.body).toMatchObject({
      receiptNumber: null,
      pdfStatus: 'pending',
      inProgress: true,
    });

    expect(await sequenceState(organization.id)).toBe(0);
    const rows = await testQuery<{ receipt_number: string | null }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(rows[0]!.receipt_number).toBeNull();
  });
});
