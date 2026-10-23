/**
 * RD-117 — trials are discontinued.
 *
 * A trial used to book a `validated` payment with `amount_paid = 0`,
 * `payment_method = 'trial'` and the FULL plan price in `plan_snapshot_price`.
 * Once `base_amount` was dropped, that snapshot became the booked amount, so
 * every trial inflated `monthlyRevenueCents`, `previousMonthRevenueCents` and
 * `GET /revenue`. The owner decided there are no more trials (discounts will be
 * coupons), so creation fails closed with `400 TRIAL_NOT_AVAILABLE` BEFORE the
 * first write, and a price-0 plan keeps using the free path.
 *
 * Standard pattern: real HTTP + Neon branch (`TEST_DATABASE_URL`), graceful
 * skip without the variable, `truncateAll` per file.
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

describe.skipIf(skipReason !== null)('Platform subscriptions: trials discontinued', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('trial-block');
    plan = await createPlatformPlan(5000);
  });

  async function createPlatformPlan(price: number): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 14,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
      },
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  async function countRows(table: 'platform_subscription' | 'platform_subscription_payment') {
    const rows = await testQuery<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return Number(rows[0]!.n);
  }

  it('rejects a new trial (400 TRIAL_NOT_AVAILABLE) and writes nothing', async () => {
    const subscriptionsBefore = await countRows('platform_subscription');
    const paymentsBefore = await countRows('platform_subscription_payment');

    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: true,
      payment: {
        amountPaid: 0,
        currencyPaid: 'USD',
        paymentMethod: 'trial',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });

    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'TRIAL_NOT_AVAILABLE' });
    expect(res.body.error).toContain('cupones');

    // Fail-closed BEFORE the first write: no orphan subscription/payment.
    expect(await countRows('platform_subscription')).toBe(subscriptionsBefore);
    expect(await countRows('platform_subscription_payment')).toBe(paymentsBefore);
  });

  it('rejects the org-scoped mirror with the same code', async () => {
    const subscriptionsBefore = await countRows('platform_subscription');

    const res = await admin.client.post(
      `/api/platform/organizations/${tenant.organization.id}/subscriptions`,
      {
        planId: plan.id,
        startDate: isoDate(0),
        isTrial: true,
        payment: {
          amountPaid: 0,
          currencyPaid: 'USD',
          paymentMethod: 'trial',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      },
    );

    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'TRIAL_NOT_AVAILABLE' });
    expect(await countRows('platform_subscription')).toBe(subscriptionsBefore);
  });

  it('keeps the free path for a price-0 plan (not a trial, snapshot 0)', async () => {
    const freePlan = await createPlatformPlan(0);

    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: freePlan.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaid: 0,
        currencyPaid: 'USD',
        paymentMethod: 'free',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);

    const [row] = await testQuery<{
      is_trial: boolean;
      payment_method: string;
      amount_paid: number;
      plan_snapshot_price: number;
      status: string;
    }>(
      `SELECT s.is_trial, p.payment_method, p.amount_paid, p.plan_snapshot_price, p.status
         FROM platform_subscription s
         JOIN platform_subscription_payment p ON p.subscription_id = s.id
        WHERE s.id = $1`,
      [res.body.id],
    );

    expect(row!.is_trial).toBe(false);
    expect(row!.payment_method).toBe('free');
    expect(row!.status).toBe('validated');
    expect(Number(row!.amount_paid)).toBe(0);
    // A free plan books 0: it never inflates the SaaS revenue KPIs.
    expect(Number(row!.plan_snapshot_price)).toBe(0);
  });
});
