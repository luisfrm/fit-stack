/**
 * Platform subscription status (unification of the payment status model).
 *
 * Covers the SaaS contract of computed (not stored) status:
 * a. SQL ↔ helper `computePlatformSubscriptionStatus` parity across the whole
 *    matrix (trial in force, validated/processing/voided in force, grace 3/7/8/
 *    14/15).
 * b. A `voided` payment is IGNORED: it neither revokes service nor moves the period.
 * c. `processing` without a qualifying payment and a period in force → `past_due`.
 * d. Staggered grace 3/10/20.
 * e. Voiding a payment does not move `currentPeriodEnd` nor restart the grace.
 * f. Point 7: a `processing` creation does NOT front-load the period; validating
 *    extends ONCE (snapshot duration) and re-PATCH does not re-extend.
 * g. Point 5: with no qualifying payment and a period ahead renewal is allowed;
 *    with a qualifying payment in force it stays blocked.
 * h. `hasPendingPayment`: a `voided` does not block a new payment; `processing` does.
 *
 * RD-113: the PATCH enum is narrowed to processing|validated|voided (no
 * `refunded`), while create/registerPayment keep the full enum.
 * RD-156: the PATCH enum drops `processing` too — only `validated | voided` are
 * legal targets, so `validated → processing → validated` can no longer extend
 * the period twice.
 *
 * Standard pattern: real HTTP + Neon branch (`TEST_DATABASE_URL`), graceful
 * skip without the variable, `truncateAll` per file. The raw facts
 * (`current_period_end`, `is_trial`, `cancelled_at`, EXISTS of a qualifying payment)
 * are read via SQL to feed the helper with the same truth as the SQL.
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
import {
  computePlatformSubscriptionStatus,
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
} from '@workspace/shared';

const STATUS = PLATFORM_SUBSCRIPTION_STATUSES;

describe.skipIf(skipReason !== null)('Platform subscription status (SaaS)', () => {
  let admin: AuthedUser;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    plan = await createPlatformPlan();
  });

  async function createPlatformPlan(): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 14,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    if (res.status !== 201) throw new Error(`create platform plan failed (${res.status}): ${res.text}`);
    return res.body;
  }

  /** SaaS subscription creation with an explicit payment status (the new default is not applied yet). */
  async function createSub(
    organizationId: string,
    opts: { paymentStatus?: string; isTrial?: boolean; startDate?: string } = {},
  ): Promise<{ subId: number; paymentId: number }> {
    const paymentStatus = opts.paymentStatus ?? 'validated';
    const startDate = opts.startDate ?? isoDate(0);
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId,
      planId: plan.id,
      startDate,
      isTrial: opts.isTrial ?? false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: paymentStatus,
        paymentDate: startDate,
      },
    });
    if (res.status !== 201) throw new Error(`create platform sub failed (${res.status}): ${res.text}`);

    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    return { subId: Number(res.body.id), paymentId: Number(rows[0]!.id) };
  }

  /** Moves `current_period_end` relative to the DB's NOW() (negative = expired). */
  async function setPeriodEndDays(subId: number, days: number): Promise<void> {
    await testQuery(
      `UPDATE platform_subscription SET current_period_end = NOW() + ($1 || ' days')::interval WHERE id = $2`,
      [String(days), subId],
    );
  }

  async function readPeriodEnd(subId: number): Promise<number> {
    const rows = await testQuery<{ current_period_end: string }>(
      `SELECT current_period_end FROM platform_subscription WHERE id = $1`,
      [subId],
    );
    return new Date(rows[0]!.current_period_end).getTime();
  }

  async function getStatus(subId: number): Promise<PlatformSubscriptionStatus> {
    const res = await admin.client.get(`/api/platform/subscriptions/${subId}`);
    expect(res.status, res.text).toBe(200);
    return res.body.status as PlatformSubscriptionStatus;
  }

  /**
   * SQL↔helper parity: reads the raw facts of the row (the same ones the SQL
   * CASE sees) and compares the status exposed by the detail with the pure helper.
   */
  async function assertParity(subId: number): Promise<PlatformSubscriptionStatus> {
    const [row] = await testQuery<{
      current_period_end: string;
      is_trial: boolean;
      cancelled_at: string | null;
      has_validated_payment: boolean;
    }>(
      `SELECT s.current_period_end, s.is_trial, s.cancelled_at,
              EXISTS (
                SELECT 1 FROM platform_subscription_payment p
                WHERE p.subscription_id = s.id
                  AND p.status IN ('validated', 'refunded')
              ) AS has_validated_payment
       FROM platform_subscription s WHERE s.id = $1`,
      [subId],
    );

    const apiStatus = await getStatus(subId);
    const helperStatus = computePlatformSubscriptionStatus({
      currentPeriodEnd: new Date(row!.current_period_end),
      isTrial: row!.is_trial,
      cancelledAt: row!.cancelled_at ? new Date(row!.cancelled_at) : null,
      hasValidatedPayment: row!.has_validated_payment,
      now: new Date(),
    });

    expect(apiStatus, `paridad SQL↔helper para sub ${subId}`).toBe(helperStatus);
    return apiStatus;
  }

  it('a+b. paridad SQL↔helper en la matriz completa de estados', async () => {
    const { organization } = await createGymTenant('status-matrix');

    const cases: Array<{
      name: string;
      expected: PlatformSubscriptionStatus;
      paymentStatus?: string;
      isTrial?: boolean;
      days: number;
    }> = [
      { name: 'trial vigente', expected: STATUS.TRIAL, isTrial: true, paymentStatus: 'validated', days: 10 },
      { name: 'validado + periodo futuro', expected: STATUS.ACTIVE, paymentStatus: 'validated', days: 10 },
      { name: 'processing + periodo futuro', expected: STATUS.PAST_DUE, paymentStatus: 'processing', days: 10 },
      { name: 'voided + periodo futuro', expected: STATUS.PAST_DUE, paymentStatus: 'voided', days: 10 },
      // Half-day offsets to avoid the exact boundary (Node clock vs
      // Postgres): exact-boundary parity is covered in the deterministic
      // unit test of `computePlatformSubscriptionStatus`.
      { name: 'vencida 3 días', expected: STATUS.PAST_DUE, paymentStatus: 'validated', days: -3 },
      { name: 'vencida 7.5 días', expected: STATUS.PAST_DUE, paymentStatus: 'validated', days: -7.5 },
      { name: 'vencida 8.5 días', expected: STATUS.READ_ONLY, paymentStatus: 'validated', days: -8.5 },
      { name: 'vencida 14.5 días', expected: STATUS.READ_ONLY, paymentStatus: 'validated', days: -14.5 },
      { name: 'vencida 15.5 días', expected: STATUS.SUSPENDED, paymentStatus: 'validated', days: -15.5 },
    ];

    for (const c of cases) {
      const { subId } = await createSub(organization.id, {
        paymentStatus: c.paymentStatus,
        isTrial: c.isTrial,
      });
      await setPeriodEndDays(subId, c.days);
      // A realistic `voided` carries audit data (the status does not depend on it).
      if (c.paymentStatus === 'voided') {
        await testQuery(
          `UPDATE platform_subscription_payment
             SET voided_at = NOW(), voided_by = 'test', void_reason = 'matriz'
           WHERE subscription_id = $1`,
          [subId],
        );
      }

      const status = await assertParity(subId);
      expect(status, c.name).toBe(c.expected);
    }
  });

  it('b. un pago de renovación `voided` se ignora: sigue `active` hasta currentPeriodEnd', async () => {
    const { organization } = await createGymTenant('void-ignored');
    const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);
    expect(await getStatus(subId)).toBe(STATUS.ACTIVE);

    const before = await readPeriodEnd(subId);

    const extra = await admin.client.post(`/api/platform/subscriptions/${subId}/payments`, {
      amountPaidCents: 5000,
      currencyPaid: 'USD',
      baseAmountCents: 5000,
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'voided',
      paymentDate: isoDate(0),
    });
    expect(extra.status, extra.text).toBe(201);

    // The new payment does not qualify and the previous validated one keeps the period.
    expect(await getStatus(subId)).toBe(STATUS.ACTIVE);
    expect(await readPeriodEnd(subId)).toBe(before);
  });

  it('RD-113: `refunded` stays accepted at creation (201) — the full enum is only narrowed on PATCH', async () => {
    const { organization } = await createGymTenant('refunded-create');
    // `createSub` throws unless the POST answers 201: this pins that the
    // narrowed PATCH enum did NOT leak into create/registerPayment.
    const { paymentId } = await createSub(organization.id, { paymentStatus: 'refunded' });

    const [row] = await testQuery<{ status: string }>(
      `SELECT status FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.status).toBe('refunded');
  });

  it('RD-113: `refunded` is not a patchable status (400) and the payment row stays intact', async () => {
    const { organization } = await createGymTenant('refunded-patch');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'processing' });
    const before = await readPeriodEnd(subId);

    const res = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'refunded' },
    );
    expect(res.status, res.text).toBe(400);

    // Rejected at the schema layer: no refund flow, no receipt, no period move.
    const [row] = await testQuery<{
      status: string;
      receipt_number: string | null;
      voided_at: string | null;
      void_reason: string | null;
    }>(
      `SELECT status, receipt_number, voided_at, void_reason
         FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.status).toBe('processing');
    expect(row!.receipt_number).toBeNull();
    expect(row!.voided_at).toBeNull();
    expect(row!.void_reason).toBeNull();

    expect(await readPeriodEnd(subId)).toBe(before);
  });

  it('RD-156: `processing` no es un destino del PATCH (400) y no mueve fila ni periodo', async () => {
    const { organization } = await createGymTenant('rd156-processing-target');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'validated' });
    const before = await readPeriodEnd(subId);

    const res = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'processing' },
    );
    expect(res.status, res.text).toBe(400);

    // Rejected at the schema layer: no status write, no voided_at, no period move.
    const [row] = await testQuery<{
      status: string;
      receipt_number: string | null;
      voided_at: string | null;
    }>(
      `SELECT status, receipt_number, voided_at
         FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.status).toBe('validated');
    expect(row!.receipt_number).toMatch(/^FS-\d{7,}$/);
    expect(row!.voided_at).toBeNull();

    expect(await readPeriodEnd(subId)).toBe(before);
  });

  it('RD-156: el vaivén `validated → processing → validated` no regala el periodo', async () => {
    const { organization } = await createGymTenant('rd156-roundtrip');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'processing' });

    const first = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(first.status, first.text).toBe(200);
    const afterFirst = await readPeriodEnd(subId);

    // The return leg is now impossible: the extension cannot be re-opened.
    const back = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'processing' },
    );
    expect(back.status, back.text).toBe(400);
    expect(await readPeriodEnd(subId)).toBe(afterFirst);

    // The idempotent re-PATCH keeps the same period (one extension, one number).
    const again = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(again.status, again.text).toBe(200);
    expect(await readPeriodEnd(subId)).toBe(afterFirst);
  });

  it('RD-156: `voided → validated` sigue siendo 409 PAYMENT_NOT_REVALIDATABLE', async () => {
    const { organization } = await createGymTenant('rd156-void-validate');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'processing' });

    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'voided', voidReason: 'Cobro anulado' },
    );
    expect(voided.status, voided.text).toBe(200);
    const before = await readPeriodEnd(subId);

    const res = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(res.status, res.text).toBe(409);
    expect(res.body).toMatchObject({ code: 'PAYMENT_NOT_REVALIDATABLE' });
    expect(await readPeriodEnd(subId)).toBe(before);
  });

  it('c. `processing` sin pago calificado con periodo vigente → past_due', async () => {
    const { organization } = await createGymTenant('processing-only');
    const { subId } = await createSub(organization.id, { paymentStatus: 'processing' });
    await setPeriodEndDays(subId, 10);

    expect(await getStatus(subId)).toBe(STATUS.PAST_DUE);
  });

  it('d. gracia escalonada: 3 → past_due, 10 → read_only, 20 → suspended', async () => {
    const { organization } = await createGymTenant('grace');
    const ladder: Array<[number, PlatformSubscriptionStatus]> = [
      [3, STATUS.PAST_DUE],
      [10, STATUS.READ_ONLY],
      [20, STATUS.SUSPENDED],
    ];

    for (const [days, expected] of ladder) {
      const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
      await setPeriodEndDays(subId, -days);
      expect(await getStatus(subId), `${days} días vencida`).toBe(expected);
    }
  });

  it('e. anular un pago no mueve currentPeriodEnd ni reinicia la gracia', async () => {
    const { organization } = await createGymTenant('grace-void');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, -10);
    const before = await readPeriodEnd(subId);
    expect(await getStatus(subId)).toBe(STATUS.READ_ONLY);

    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'voided', voidReason: 'Cobro anulado' },
    );
    expect(voided.status, voided.text).toBe(200);

    // The SaaS void neither cancels the sub nor re-anchors the period: the grace
    // keeps running from the SAME currentPeriodEnd (it is not reset to ~0 days).
    expect(await readPeriodEnd(subId)).toBe(before);
    expect(await getStatus(subId)).toBe(STATUS.READ_ONLY);
  });

  it('f. Punto 7: alta `processing` no front-loadea; validar extiende una sola vez', async () => {
    const { organization } = await createGymTenant('punto-7');
    const startDate = isoDate(0);
    const { subId, paymentId } = await createSub(organization.id, {
      paymentStatus: 'processing',
      startDate,
    });

    // `currentPeriodEnd === startDate` (UTC midnight), without giving away time.
    const startUtc = new Date(`${startDate}T00:00:00.000Z`).getTime();
    expect(await readPeriodEnd(subId)).toBe(startUtc);

    const first = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(first.status, first.text).toBe(200);

    const afterFirst = await readPeriodEnd(subId);
    expect(afterFirst).toBeGreaterThan(Date.now());
    // Exactly one plan duration (~1 month), not two.
    const delta = afterFirst - Date.now();
    expect(delta).toBeGreaterThan(27 * 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(32 * 24 * 60 * 60 * 1000);

    // Re-PATCH to validated is idempotent: it does not extend again.
    const second = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(second.status, second.text).toBe(200);
    expect(await readPeriodEnd(subId)).toBe(afterFirst);
  });

  it('g. Punto 5: sin pago calificado y periodo por delante permite renovar (201)', async () => {
    const { owner, organization } = await createGymTenant('renew-unpaid');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);

    // Voiding the only validated charge: the period stays (void does not move it),
    // but there is no longer a qualifying payment to sustain it.
    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'voided', voidReason: 'Cobro anulado' },
    );
    expect(voided.status, voided.text).toBe(200);

    // The computed status (SQL) is `past_due`: there is a period ahead but
    // there is NO `EXISTS(validated|refunded)`.
    const statusBefore = await assertParity(subId);
    expect(statusBefore, 'voided-only con periodo futuro debe ser past_due').toBe(STATUS.PAST_DUE);

    const res = await owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(res.status, res.text).toBe(201);
    expect(res.body.paymentId).toBeDefined();
  });

  it('g. Punto 5: con pago calificado y periodo vigente sigue bloqueado (409)', async () => {
    const { owner, organization } = await createGymTenant('renew-paid');
    const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);

    const res = await owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(res.status, res.text).toBe(409);
    expect(res.body.error).toContain('vigente');
  });

  it('h. `hasPendingPayment`: un `voided` no bloquea; un `processing` sí', async () => {
    // processing → blocks renewal.
    const blocked = await createGymTenant('pending-block');
    const { subId: blockedSub } = await createSub(blocked.organization.id, {
      paymentStatus: 'processing',
    });
    await setPeriodEndDays(blockedSub, -3);
    const blockedRes = await blocked.owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(blockedRes.status, blockedRes.text).toBe(409);
    expect(blockedRes.body.error).toContain('pendiente');

    // voided → does not block.
    const free = await createGymTenant('pending-free');
    const { subId: freeSub } = await createSub(free.organization.id, { paymentStatus: 'voided' });
    await setPeriodEndDays(freeSub, -3);
    const freeRes = await free.owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(freeRes.status, freeRes.text).toBe(201);
  });
});
