/**
 * SaaS compensation when the emission fails.
 *
 * The 4 SaaS flows commit without a transaction (Neon HTTP has no `db.transaction()`):
 * the `catch` compensates by re-reading with the phase-2 helper. SaaS semantics:
 * a creation left without a valid payment is also voided with `cancel()` — never
 * `delete()` (a `voided` is ignored in the SaaS computation and would leave a
 * front-loaded period with no charge to sustain it); renewal/registration/transition
 * void the payment and REVERT the moved period to the value read before
 * extending. A compensated payment (`voided`) cannot be re-validated to extend
 * again (anti double-extension guard).
 *
 * The failure is induced by breaking the fiscal country (`XX`): `resolveFiscalProfile`
 * throws `FISCAL_PROFILE_UNKNOWN` BEFORE consuming the `FS-N` sequence.
 * All money in integer cents.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import { addDuration } from '@workspace/shared';
import { COMPENSATION_VOID_REASON } from '../../src/lib/subscription-compensation';

const PRICE_CENTS = 5000;

describe.skipIf(skipReason !== null)('Platform subscriptions compensation (fase 3)', () => {
  let admin: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    admin = await registerPlatformUser('admin');
  });

  async function createPlatformPlan(): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: PRICE_CENTS,
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

  function validatedPayment() {
    return {
      amountPaidCents: PRICE_CENTS,
      currencyPaid: 'USD',
      baseAmountCents: PRICE_CENTS,
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(0),
    };
  }

  function altaPayload(organizationId: string, planId: number, startDate = isoDate(0)) {
    return {
      organizationId,
      planId,
      startDate,
      isTrial: false,
      payment: validatedPayment(),
    };
  }

  /** Breaks the fiscal profile: the emission throws without consuming the `FS-N` series. */
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

  async function readPayments(organizationId: string) {
    return testQuery<{
      id: number;
      subscription_id: number;
      status: string;
      amount_paid: number;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      receipt_number: string | null;
    }>(
      `SELECT id, subscription_id, status, amount_paid, void_reason, voided_at,
              voided_by, receipt_number
         FROM platform_subscription_payment WHERE organization_id = $1 ORDER BY id`,
      [organizationId],
    );
  }

  async function readSubs(organizationId: string) {
    return testQuery<{
      id: number;
      cancelled_at: string | null;
      current_period_end: string;
    }>(
      `SELECT id, cancelled_at, current_period_end
         FROM platform_subscription WHERE organization_id = $1 ORDER BY id`,
      [organizationId],
    );
  }

  async function readSequence(): Promise<number> {
    const rows = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM platform_document_sequence WHERE document_type = 'receipt'`,
    );
    return rows[0]?.last_number ?? 0;
  }

  /** Visible guarantee: no valid charge without a receipt (except $0 `pre_system` by design). */
  async function expectNoValidChargeWithoutReceipt(organizationId: string) {
    const orphans = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment
        WHERE organization_id = $1 AND status IN ('validated', 'refunded')
          AND receipt_number IS NULL AND amount_paid <> 0`,
      [organizationId],
    );
    expect(orphans).toEqual([]);
  }

  it('(a) alta con fallo de emisión → pago voided con motivo + suscripción cancelada, sin FS-N consumido; reintento limpio', async () => {
    const { organization } = await createGymTenant('psca-a');
    const orgId = organization.id;
    const plan = await createPlatformPlan();
    const seqBefore = await readSequence();
    await breakFiscalCountry(orgId);

    const failed = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    // The original error is re-thrown after compensating: `onError` translates it.
    expect(failed.status, failed.text).not.toBe(201);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // Creation without a valid payment: cancelled, never deleted (rule 6, the
    // `FS-N` series is not emptied via `DELETE /api/platform/subscriptions/:id`).
    const subs = await readSubs(orgId);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.cancelled_at).not.toBeNull();

    // The fiscal profile is resolved BEFORE consuming the global sequence.
    expect(await readSequence()).toBe(seqBefore);

    await expectNoValidChargeWithoutReceipt(orgId);

    // Retry with fixed fiscal data: 201, no duplication (the `voided` does not
    // block: the guard only stops `processing`).
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    expect(retry.status, retry.text).toBe(201);

    const subsAfter = await readSubs(orgId);
    expect(subsAfter).toHaveLength(2);
    expect(subsAfter.filter((s) => s.cancelled_at == null)).toHaveLength(1);

    const charges = await testQuery<{
      id: number;
      status: string;
      receipt_number: string | null;
    }>(
      `SELECT id, status, receipt_number FROM platform_subscription_payment
        WHERE organization_id = $1 AND status IN ('validated', 'refunded')`,
      [orgId],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);
  });

  it('(b) renovación con fallo → pago voided y periodo REVERTIDO al valor previo', async () => {
    const { organization } = await createGymTenant('pscb-b');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // Healthy creation: front-loaded period (start + 1 month of the plan).
    const alta = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const periodBefore = new Date((await readSubs(orgId))[0]!.current_period_end);

    await breakFiscalCountry(orgId);
    const failed = await admin.client.post(`/api/platform/subscriptions/${subId}/renew`, {
      payment: validatedPayment(),
    });
    expect(failed.status, failed.text).not.toBe(200);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(2);
    const renewal = payments[1]!;
    expect(renewal.status).toBe('voided');
    expect(renewal.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(renewal.voided_at).not.toBeNull();
    expect(renewal.voided_by).toBeTruthy();
    expect(renewal.receipt_number).toBeNull();

    // The period was moved before the failure and is REVERTED to the previous value:
    // with no transaction, the compensating write is honest (`currentPeriodEnd` was
    // read before extending). No `cancelParent`: the subscription already existed.
    const subs = await readSubs(orgId);
    expect(subs[0]!.cancelled_at).toBeNull();
    const periodAfter = new Date(subs[0]!.current_period_end);
    expect(periodAfter.getTime()).toBe(periodBefore.getTime());

    await expectNoValidChargeWithoutReceipt(orgId);

    // Retry with fixed fiscal data: 200 with a single new charge (the
    // `voided` does not block the guard); the period accumulates from the reverted
    // value (base = periodBefore), not from a period moved twice.
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(`/api/platform/subscriptions/${subId}/renew`, {
      payment: validatedPayment(),
    });
    expect(retry.status, retry.text).toBe(200);

    const after = await readPayments(orgId);
    expect(after).toHaveLength(3);
    expect(after.filter((p) => p.status === 'voided')).toHaveLength(1);
    const valid = after.filter((p) => p.status === 'validated' || p.status === 'refunded');
    expect(valid).toHaveLength(2);
    expect(valid[1]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);

    // A single extra period for a single payment: the failed one does not give away days.
    const periodFinal = new Date((await readSubs(orgId))[0]!.current_period_end);
    expect(periodFinal.getTime()).toBe(addDuration(periodBefore, 1, 'month', 'UTC').getTime());
  });

  it('(c) transición a validado con fallo → pago voided, periodo revertido; re-PATCH no re-extiende', async () => {
    const { organization } = await createGymTenant('pscb-c');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // `processing` creation: no emission, period = start (60 days ago).
    const alta = await admin.client.post('/api/platform/subscriptions', {
      ...altaPayload(orgId, plan.id, isoDate(-60)),
      payment: { ...validatedPayment(), status: 'processing', paymentDate: isoDate(-60) },
    });
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const paymentRows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subId],
    );
    const paymentId = Number(paymentRows[0]!.id);
    const periodBefore = new Date((await readSubs(orgId))[0]!.current_period_end);

    await breakFiscalCountry(orgId);
    const failed = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(failed.status, failed.text).not.toBe(200);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // The transition extended the period before failing and is REVERTED to
    // the previous value; the subscription is not cancelled (it already existed).
    const subs = await readSubs(orgId);
    expect(subs[0]!.cancelled_at).toBeNull();
    expect(new Date(subs[0]!.current_period_end).getTime()).toBe(periodBefore.getTime());

    await expectNoValidChargeWithoutReceipt(orgId);

    // Anti double-extension guard: re-PATCH of the compensated payment to `validated`
    // is rejected by code (a `voided` cannot be re-validated: there is no valid
    // charge and the validated ⇔ numbered invariant forbids it).
    const rePatch = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(rePatch.status, rePatch.text).toBe(409);
    expect(rePatch.body).toMatchObject({ code: 'PAYMENT_NOT_REVALIDATABLE' });
    const afterRePatch = await readPayments(orgId);
    expect(afterRePatch[0]!.status).toBe('voided');
    expect(new Date((await readSubs(orgId))[0]!.current_period_end).getTime()).toBe(
      periodBefore.getTime(),
    );

    // Clean retry: a new payment after fixing the fiscal data (the `voided`
    // does not block the pending guard); a single valid numbered charge.
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(
      `/api/platform/subscriptions/${subId}/payments`,
      validatedPayment(),
    );
    expect(retry.status, retry.text).toBe(201);

    const after = await readPayments(orgId);
    expect(after).toHaveLength(2);
    const valid = after.filter((p) => p.status === 'validated' || p.status === 'refunded');
    expect(valid).toHaveLength(1);
    expect(valid[0]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);
  });

  it('(d) validar un pago de una suscripción cancelada → 409 con code, sin validated huérfano', async () => {
    const { organization } = await createGymTenant('pscb-d');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // `processing` creation (no emission) and then cancellation of the subscription.
    const alta = await admin.client.post('/api/platform/subscriptions', {
      ...altaPayload(orgId, plan.id),
      payment: { ...validatedPayment(), status: 'processing' },
    });
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const paymentRows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subId],
    );
    const paymentId = Number(paymentRows[0]!.id);

    // Logical cancellation (not `DELETE`, which hard-deletes and takes the payment
    // via cascade): it sets `cancelled_at` and the `processing` payment survives.
    const cancel = await admin.client.post(`/api/platform/subscriptions/${subId}/cancel`, {
      reason: 'Cancelación de prueba (d)',
    });
    expect(cancel.status, cancel.text).toBe(200);

    // The `processing` payment of a cancelled subscription is NOT validated: without this
    // guard a `validated` with no number would remain (validated ⇔ numbered invariant).
    const attempt = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(attempt.status, attempt.text).toBe(409);
    expect(attempt.body).toMatchObject({ code: 'SUBSCRIPTION_CANCELLED' });

    const payments = await readPayments(orgId);
    expect(payments[0]!.status).toBe('processing');
    expect(payments[0]!.receipt_number).toBeNull();
    await expectNoValidChargeWithoutReceipt(orgId);
  });
});
