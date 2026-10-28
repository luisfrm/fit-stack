/**
 * SaaS free plan and server-side pricing.
 *
 * Trials no longer exist (`is_trial` / `trial_days` were dropped): a `price = 0`
 * plan IS the free path — `validated` payment, `payment_method = 'free'`, zero
 * amounts, no rates, no receipt number.
 *
 * Every amount is priced by the server from the plan and the rate provider: the
 * request body never carries `amountPaid` / `exchangeRateApplied`. Sending them
 * anyway must not change what is booked (they are not part of the contract).
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

describe.skipIf(skipReason !== null)('Platform subscriptions: free plan and server pricing', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('free-plan');
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
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
      },
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  async function readPayment(subscriptionId: number): Promise<{
    payment_method: string;
    status: string;
    amount_paid: number;
    plan_snapshot_price: number;
    exchange_rate_applied: string | null;
    platform_amount: number | null;
    platform_rate_applied: string | null;
  }> {
    const [row] = await testQuery<{
      payment_method: string;
      status: string;
      amount_paid: number;
      plan_snapshot_price: number;
      exchange_rate_applied: string | null;
      platform_amount: number | null;
      platform_rate_applied: string | null;
    }>(
      `SELECT payment_method, status, amount_paid, plan_snapshot_price,
              exchange_rate_applied::text AS exchange_rate_applied,
              platform_amount, platform_rate_applied::text AS platform_rate_applied
         FROM platform_subscription_payment
        WHERE subscription_id = $1`,
      [subscriptionId],
    );
    return row!;
  }

  it('books a price-0 plan through the free path (zero amounts, no rates)', async () => {
    const freePlan = await createPlatformPlan(0);

    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: freePlan.id,
      startDate: isoDate(0),
      payment: {
        currencyPaid: 'USD',
        paymentMethod: 'free',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);

    const row = await readPayment(res.body.id);
    // A free plan is validated by definition and never books revenue.
    expect(row.payment_method).toBe('free');
    expect(row.status).toBe('validated');
    expect(Number(row.plan_snapshot_price)).toBe(0);
    expect(Number(row.amount_paid)).toBe(0);
    expect(Number(row.platform_amount)).toBe(0);
    expect(row.exchange_rate_applied).toBeNull();
    expect(row.platform_rate_applied).toBeNull();
  });

  it('ignores amounts sent in the body (the server prices the payment)', async () => {
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      payment: {
        // Not part of the contract anymore: stripped, never trusted.
        amountPaid: 1,
        exchangeRateApplied: '999',
        currencyPaid: 'USD',
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);

    const row = await readPayment(res.body.id);
    // Plan USD 5000 paid in the primary currency (USD): 1:1 on both hops.
    expect(Number(row.amount_paid)).toBe(5000);
    // `numeric(20,10)` is returned padded to its scale.
    expect(row.exchange_rate_applied).toBe('1.0000000000');
    expect(Number(row.platform_amount)).toBe(5000);
    expect(row.platform_rate_applied).toBe('1.0000000000');
    expect(row.payment_method).toBe('zelle');
  });
});
