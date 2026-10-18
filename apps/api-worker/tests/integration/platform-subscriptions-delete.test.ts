/**
 * SaaS subscription deletion guard (RD-153).
 *
 * A `platform_subscription` with payments is financial history: it must be
 * cancelled, never hard-deleted. The API answers `409 SUBSCRIPTION_HAS_PAYMENTS`
 * and the DB-level `RESTRICT` FK is the backstop (no cascade).
 *
 * Uses a `processing` payment so receipt emission (and the `FS-N` sequence)
 * is not involved.
 *
 * NOTE: the last case asserts the DB-level `RESTRICT` rule, so it requires
 * migration `0024` to be applied. Until then the FK is still `CASCADE` on the
 * shared Neon test branch and that single case fails on purpose (the API-level
 * cases are independent of the migration).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  isoDate,
  registerPlatformUser,
  uid,
  type AuthedUser,
} from '../helpers/auth';

const PRICE_CENTS = 5000;

describe.skipIf(skipReason !== null)('Platform subscription deletion', () => {
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

  async function createSubscriptionWithPayment(): Promise<{
    subscriptionId: number;
    paymentId: number;
    organizationId: string;
  }> {
    const { organization } = await createGymTenant('rd153');
    const plan = await createPlatformPlan();

    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaidCents: PRICE_CENTS,
        currencyPaid: 'USD',
        baseAmountCents: PRICE_CENTS,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        // `processing`: no receipt emission, no `FS-N` sequence dependency.
        status: 'processing',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);

    const subscriptionId = Number(res.body.id);
    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subscriptionId],
    );
    expect(rows).toHaveLength(1);

    return {
      subscriptionId,
      paymentId: Number(rows[0]!.id),
      organizationId: organization.id,
    };
  }

  it('rejects DELETE with 409 and deletes zero rows when payments exist', async () => {
    const { subscriptionId, paymentId } = await createSubscriptionWithPayment();

    // Give the payment a receipt number to prove it survives the rejected delete.
    await testQuery(
      `UPDATE platform_subscription_payment
          SET receipt_number = 'FS-9000001', receipt_issued_at = NOW()
        WHERE id = $1`,
      [paymentId],
    );

    const res = await admin.client.delete(
      `/api/platform/subscriptions/${subscriptionId}`,
    );
    expect(res.status, res.text).toBe(409);
    expect(res.body).toMatchObject({ code: 'SUBSCRIPTION_HAS_PAYMENTS' });

    const rows = await testQuery<{
      subscriptions: number;
      payments: number;
      receipt_number: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM platform_subscription WHERE id = $1) AS subscriptions,
         (SELECT COUNT(*)::int FROM platform_subscription_payment WHERE subscription_id = $1) AS payments,
         (SELECT receipt_number FROM platform_subscription_payment WHERE subscription_id = $1 LIMIT 1) AS receipt_number`,
      [subscriptionId],
    );
    expect(rows[0]).toEqual({
      subscriptions: 1,
      payments: 1,
      receipt_number: 'FS-9000001',
    });
  });

  it('still deletes a subscription without payments', async () => {
    const { subscriptionId } = await createSubscriptionWithPayment();

    // Remove the payment first: this test targets the no-payments branch.
    await testQuery(
      `DELETE FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subscriptionId],
    );

    const res = await admin.client.delete(
      `/api/platform/subscriptions/${subscriptionId}`,
    );
    expect(res.status, res.text).toBe(200);

    const rows = await testQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM platform_subscription WHERE id = $1`,
      [subscriptionId],
    );
    expect(rows[0]!.total).toBe(0);
  });

  it('the DB-level RESTRICT FK blocks a direct delete with payments', async () => {
    const { subscriptionId } = await createSubscriptionWithPayment();

    await expect(
      testQuery(`DELETE FROM platform_subscription WHERE id = $1`, [subscriptionId]),
    ).rejects.toMatchObject({ code: '23503' });

    const rows = await testQuery<{ subscriptions: number; payments: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM platform_subscription WHERE id = $1) AS subscriptions,
         (SELECT COUNT(*)::int FROM platform_subscription_payment WHERE subscription_id = $1) AS payments`,
      [subscriptionId],
    );
    expect(rows[0]).toEqual({ subscriptions: 1, payments: 1 });
  });
});
