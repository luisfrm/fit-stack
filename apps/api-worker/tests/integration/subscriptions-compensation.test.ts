/**
 * Panel creation compensation when the emission fails.
 *
 * The creation commits in 3 steps without a transaction (`subsRepo.create` →
 * `paymentsRepo.create` → step 1). Without interactive transactions (Neon HTTP
 * driver) the `catch` compensates by re-reading: a payment with no number →
 * `voided` with a fixed reason (retryable: the guard only blocks `processing`);
 * a failure inserting the payment → the orphan is cancelled, never deleted
 * (rule 6).
 *
 * All money in integer cents; the tz is injected by `requireOrgTimezone()`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll, TEST_DATABASE_URL } from '../helpers/db';
import { withRateServer } from '../helpers/rates';
import {
  createGymTenant,
  createGymMember,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';
import { COMPENSATION_VOID_REASON } from '../../src/lib/subscription-compensation';
import { createDb } from '@workspace/database/factory';
import { createSubscriptionsRepository } from '../../src/repositories/subscriptions.repository';
import { createPaymentsRepository } from '../../src/repositories/payments.repository';
import { createPlansRepository } from '../../src/repositories/plans.repository';
import { createMembersRepository } from '../../src/repositories/members.repository';
import {
  createSubscriptionsService,
  type ReceiptHooks,
} from '../../src/services/subscriptions.service';

const AMOUNT_CENTS = 10000;

describe.skipIf(skipReason !== null)('Subscriptions compensation', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Member + plan ready for creation (plan price in cents). */
  async function setupFixture(tenant: GymTenant) {
    const member = await createGymMember(tenant.owner.client);
    const plan = await createPlan(tenant.owner.client, {
      price: AMOUNT_CENTS,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
    });
    return { member, plan };
  }

  function subscriptionPayload(memberId: number, planId: number, extraPayment = {}) {
    return {
      memberId,
      planId,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
        ...extraPayment,
      },
    };
  }

  /** Breaks the fiscal profile: `resolveFiscalProfile` throws with no fallback. */
  async function breakFiscalCountry(organizationId: string) {
    await testQuery(`UPDATE organization SET country_code = 'XX' WHERE id = $1`, [
      organizationId,
    ]);
  }

  async function fixFiscalCountry(organizationId: string) {
    await testQuery(`UPDATE organization SET country_code = 'VE' WHERE id = $1`, [
      organizationId,
    ]);
  }

  it('(a) fallo de emisión → error sin 201, pago voided con motivo, sin número ni hueco ni filas en el reporte', async () => {
    const { owner, organization } = await createGymTenant('comp-a');
    const { member, plan } = await setupFixture({ owner, organization });
    await breakFiscalCountry(organization.id);

    const res = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    // The original error is re-thrown after compensating: `onError` translates it.
    expect(res.status, res.text).not.toBe(201);

    const payments = await testQuery<{
      id: number;
      status: string;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      receipt_number: string | null;
    }>(
      `SELECT id, status, void_reason, voided_at, voided_by, receipt_number
         FROM payment WHERE member_id = $1`,
      [member.id],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // The fiscal profile is resolved BEFORE consuming the sequence: no
    // burned correlative → no hole in the yearly sequence.
    const seq = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence WHERE organization_id = $1`,
      [organization.id],
    );
    expect(seq).toHaveLength(0);

    // The `voided` payment without a number is not a receipt: out of the report.
    const report = await owner.client.get('/api/reports/receipts');
    expect(report.status, report.text).toBe(200);
    expect(report.body.rows).toEqual([]);
    expect(report.body.total).toBe(0);
    expect(report.body.gaps).toEqual([]);

    // The subscription still exists as ANULADA: nothing is deleted (rule 6).
    const list = await owner.client.get<{ data: Array<{ id: number; status: string }> }>(
      '/api/subscriptions',
      { query: { limit: '10' } },
    );
    expect(list.body.data.map((r) => r.status)).toContain('voided');
  });

  it('(b) reintento con fiscal corregido → exactamente 1 suscripción válida y 1 cobro', async () => {
    const { owner, organization } = await createGymTenant('comp-b');
    const { member, plan } = await setupFixture({ owner, organization });
    await breakFiscalCountry(organization.id);

    const failed = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    expect(failed.status, failed.text).not.toBe(201);

    await fixFiscalCountry(organization.id);
    const retry = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    // The `voided` does not block the retry (the guard only stops `processing`).
    expect(retry.status, retry.text).toBe(201);

    // Count by memberId: 2 subscription rows (the compensated one is kept
    // as ANULADA audit) but exactly 1 valid one and 1 charge.
    const subs = await testQuery<{ id: number }>(
      `SELECT id FROM subscription WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(subs).toHaveLength(2);

    const valid = await testQuery<{ id: number }>(
      `SELECT s.id FROM subscription s
         JOIN payment p ON p.subscription_id = s.id
        WHERE s.member_id = $1 AND s.organization_id = $2 AND p.status <> 'voided'`,
      [member.id, organization.id],
    );
    expect(valid).toHaveLength(1);

    const charges = await testQuery<{
      id: number;
      status: string;
      receipt_number: string | null;
    }>(
      `SELECT id, status, receipt_number FROM payment
        WHERE member_id = $1 AND organization_id = $2 AND status <> 'voided'`,
      [member.id, organization.id],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.status).toBe('validated');
    expect(charges[0]!.receipt_number).toBeTruthy();
  });

  it('(c) fallo en payment.insert → huérfana cancelada, ningún pago huérfano', async () => {
    const { owner, organization } = await createGymTenant('comp-c');
    const { member, plan } = await setupFixture({ owner, organization });

    // RD-158: the rate is server-derived, so the insert is poisoned through the
    // provider instead of the payload. `1e30` overflows the rate column
    // (`numeric(20,10)` after RD-157: 10 integer digits) AND the bigint
    // `amount_paid` (1e30 * 100 cents), so `paymentsRepo.create` fails in the
    // DB — after the subscription was already written. Kept
    // precision-independent on purpose: the failure is a range overflow, not
    // a rate rounding.
    await withRateServer({ VES: 1e30 }, async (url) => {
      owner.client.env.EXCHANGE_API_URL = url;
      const res = await owner.client.post(
        '/api/subscriptions',
        subscriptionPayload(member.id, plan.id, { currencyPaid: 'VES' }),
      );
      expect(res.status, res.text).not.toBe(201);
    });

    const subs = await testQuery<{ id: number; cancelled_at: string | null }>(
      `SELECT id, cancelled_at FROM subscription
        WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(subs).toHaveLength(1);
    // Orphan cancelled, never deleted (rule 6).
    expect(subs[0]!.cancelled_at).not.toBeNull();

    // No orphan payment: the LEFT JOIN matches nothing for the subscription.
    const orphans = await testQuery<{ id: number }>(
      `SELECT s.id FROM subscription s
         LEFT JOIN payment p ON p.subscription_id = s.id
        WHERE s.id = $1 AND p.id IS NULL`,
      [subs[0]!.id],
    );
    expect(orphans).toHaveLength(1);

    const payments = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(payments).toHaveLength(0);
  });

  it('(d) alta exitosa con la invalidación en finally → 201 intacto', async () => {
    // The compensation wrapped `service + invalidation` in try/finally: on the
    // happy path the result must stay intact (the invalidation still runs,
    // Redis is a no-op in tests, but the 201 and the body must be unchanged).
    const { owner, organization } = await createGymTenant('comp-d');
    const { member, plan } = await setupFixture({ owner, organization });

    const res = await owner.client.post<{ id: number; endDate: string }>(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    expect(res.status, res.text).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.endDate).toBeTruthy();

    // The payment ended up validated and numbered (successful emission).
    const charges = await testQuery<{ status: string; receipt_number: string | null }>(
      `SELECT status, receipt_number FROM payment
        WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.status).toBe('validated');
    expect(charges[0]!.receipt_number).toBeTruthy();
  });

  it('(e) PATCH del gym: fallo de emisión → pago voided con auditoría, período intacto y 409 al reintentar', async () => {
    const { owner, organization } = await createGymTenant('comp-e');
    const { member, plan } = await setupFixture({ owner, organization });

    // `processing` payment: creation does not number it, it awaits approval.
    const created = await owner.client.post<{ id: number }>(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id, { status: 'processing' }),
    );
    expect(created.status, created.text).toBe(201);

    const seeded = await testQuery<{ id: number; end_date: string }>(
      `SELECT p.id, s.end_date
         FROM payment p
         JOIN subscription s ON s.id = p.subscription_id
        WHERE p.subscription_id = $1`,
      [created.body.id],
    );
    const paymentId = Number(seeded[0]!.id);
    const periodEnd = seeded[0]!.end_date;

    // The HTTP route always wires the real receipts service, so the failing
    // emission is injected at the service boundary (same wiring as the route).
    const db = createDb(TEST_DATABASE_URL);
    const service = createSubscriptionsService(
      createSubscriptionsRepository(db),
      createPaymentsRepository(db),
      createPlansRepository(db),
      createMembersRepository(db),
    );
    const emissionError = new Error('emission failed (test)');
    const receipts: ReceiptHooks = {
      assignReceiptNumber: async () => {
        throw emissionError;
      },
      markReceiptVoided: async () => undefined,
    };

    // The ORIGINAL error surfaces (never the compensation one).
    await expect(
      service.updatePaymentStatus(organization.id, paymentId, 'validated', {
        receipts,
        timezone: 'America/Caracas',
        by: owner.userId,
      }),
    ).rejects.toBe(emissionError);

    // Compensated: `voided` with audit, no number — never `validated` without
    // number (the state the sweep could not repair).
    const paid = await testQuery<{
      status: string;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      receipt_number: string | null;
    }>(
      `SELECT status, void_reason, voided_at, voided_by, receipt_number
         FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(paid[0]!.status).toBe('voided');
    expect(paid[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(paid[0]!.voided_by).toBe(owner.userId);
    expect(paid[0]!.voided_at).not.toBeNull();
    expect(paid[0]!.receipt_number).toBeNull();

    // No `cancelParent` and no `revertEffect`: the subscription keeps its
    // period and is NOT cancelled (the void alone derives ANULADA).
    const subs = await testQuery<{ cancelled_at: string | null; end_date: string }>(
      `SELECT cancelled_at, end_date FROM subscription WHERE id = $1`,
      [created.body.id],
    );
    expect(subs[0]!.cancelled_at).toBeNull();
    expect(subs[0]!.end_date).toBe(periodEnd);

    // Receipt contract: no link to a document that does not exist.
    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status, receipt.text).toBe(200);
    expect(receipt.body).toEqual({ available: false, reason: 'pre_system' });
    const pdf = await owner.client.get(`/api/payments/${paymentId}/receipt/pdf`);
    expect(pdf.status).toBe(404);

    // The guard still fires: the compensated void is NOT re-validatable, and the
    // audit trail is preserved (the 409 writes nothing).
    const retry = await owner.client.patch(`/api/payments/${paymentId}/status`, {
      status: 'validated',
    });
    expect(retry.status, retry.text).toBe(409);
    expect(retry.body).toMatchObject({ code: 'PAYMENT_NOT_REVALIDATABLE' });

    const after = await testQuery<{ status: string; void_reason: string | null }>(
      `SELECT status, void_reason FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(after[0]!.status).toBe('voided');
    expect(after[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
  });
});
