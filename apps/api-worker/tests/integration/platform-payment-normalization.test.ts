/**
 * SaaS multi-currency normalization (RD-161).
 *
 * Every SaaS payment persists TWO rates and one amount:
 * - `exchange_rate_applied`: plan currency -> paid currency (`amount_paid`);
 * - `platform_rate_applied`: plan currency -> `platform_setting.primary_currency`
 *   (`platform_amount`, integer cents).
 *
 * Both are priced by the SERVER from the plan and the rate provider — the
 * request body never states an amount or a rate. Reports read the persisted
 * `platform_amount`, so a plan quoted in a currency other than the primary one
 * (or paid in one) sums without any read-time division, and rows the backfill
 * could not normalize stay `NULL` and are reported as unconverted instead of
 * being assumed 1:1.
 *
 * The last block freezes the two normalizations the reports depend on:
 * `primary_currency` (409 once a payment exists) and a plan's currency (409 once
 * the plan has payments).
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
import { withRateServer } from '../helpers/rates';

/**
 * Fails LOUDLY (never a silent skip) when the additive migration is missing in
 * the branch: the suite cannot assert normalization against an old schema.
 */
async function assertNormalizationColumns(): Promise<void> {
  const rows = await testQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'platform_subscription_payment'
        AND column_name IN ('platform_amount', 'platform_rate_applied')`,
  );
  if (rows.length !== 2) {
    throw new Error(
      'platform_subscription_payment lacks platform_amount/platform_rate_applied: ' +
        'migrations 0030/0031 are not applied in this branch (pnpm db:migrate is pending approval).',
    );
  }
}

describe.skipIf(skipReason !== null)('Platform payment normalization', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;

  beforeAll(async () => {
    await assertSchemaReady();
    await assertNormalizationColumns();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('normalization');
  });

  async function createPlan(price: number, currency: string): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price,
      currency,
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      features: { panel: { enabled: true } },
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  /** Creates the subscription with the rate provider pointed at a local server. */
  async function createSubscription(
    organizationId: string,
    planId: number,
    currencyPaid: string,
    rates: Record<string, number>,
  ) {
    return withRateServer(rates, async (url) => {
      admin.client.env.EXCHANGE_API_URL = url;
      return admin.client.post('/api/platform/subscriptions', {
        organizationId,
        planId,
        startDate: isoDate(0),
        payment: {
          currencyPaid,
          paymentMethod: 'zelle',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
    });
  }

  async function readPayment(subscriptionId: number) {
    const [row] = await testQuery<{
      amount_paid: number;
      currency_paid: string;
      exchange_rate_applied: string | null;
      platform_amount: number | null;
      platform_rate_applied: string | null;
      plan_snapshot_price: number;
      plan_snapshot_currency: string;
    }>(
      `SELECT amount_paid, currency_paid,
              exchange_rate_applied::text AS exchange_rate_applied,
              platform_amount,
              platform_rate_applied::text AS platform_rate_applied,
              plan_snapshot_price, plan_snapshot_currency
         FROM platform_subscription_payment
        WHERE subscription_id = $1`,
      [subscriptionId],
    );
    return row!;
  }

  it('plan USD paid in EUR: both hops are persisted (primary is USD)', async () => {
    const plan = await createPlan(5000, 'USD');
    const res = await createSubscription(tenant.organization.id, plan.id, 'EUR', {
      EUR: 0.9,
    });
    expect(res.status, res.text).toBe(201);

    const row = await readPayment(res.body.id);
    // Plan -> paid currency drives the charge.
    expect(Number(row.amount_paid)).toBe(4500);
    // `numeric(20,10)` is returned padded to its scale (never a rounded float).
    expect(row.exchange_rate_applied).toBe('0.9000000000');
    // Plan -> primary currency (USD) is the reported amount.
    expect(Number(row.platform_amount)).toBe(5000);
    expect(row.platform_rate_applied).toBe('1.0000000000');
  });

  it('plan VES paid in COP: the platform amount is not the plan currency', async () => {
    const plan = await createPlan(40000, 'VES');
    const res = await createSubscription(tenant.organization.id, plan.id, 'COP', {
      COP: 400,
      USD: 0.0025,
    });
    expect(res.status, res.text).toBe(201);

    const row = await readPayment(res.body.id);
    // 40000 VES cents * 400 = 16,000,000 COP cents.
    expect(Number(row.amount_paid)).toBe(16_000_000);
    expect(row.exchange_rate_applied).toBe('400.0000000000');
    // 40000 VES cents * 0.0025 = 100 USD cents (the primary currency).
    expect(Number(row.platform_amount)).toBe(100);
    expect(row.platform_rate_applied).toBe('0.0025000000');
  });

  it('plan USD paid in VES: the paid amount never becomes the reported one', async () => {
    const plan = await createPlan(5000, 'USD');
    const res = await createSubscription(tenant.organization.id, plan.id, 'VES', {
      VES: 40,
    });
    expect(res.status, res.text).toBe(201);

    const row = await readPayment(res.body.id);
    expect(Number(row.amount_paid)).toBe(200_000);
    expect(row.exchange_rate_applied).toBe('40.0000000000');
    expect(Number(row.platform_amount)).toBe(5000);
    expect(row.platform_rate_applied).toBe('1.0000000000');
  });

  it('GET /stats sums platform_amount and reports the frozen MRR rates', async () => {
    const res = await admin.client.get('/api/platform/subscriptions/stats');
    expect(res.status, res.text).toBe(200);

    // 5000 (USD) + 100 (VES plan normalized) + 5000 (USD plan paid in VES).
    expect(res.body.monthlyRevenueCents).toBe(10100);
    // MRR = current plan price x the rate frozen in the latest validated
    // payment: 5000 x 1 + 40000 x 0.0025 + 5000 x 1.
    expect(res.body.mrrCents).toBe(10100);
    expect(res.body.primaryCurrency).toBe('USD');
    expect(res.body.unconvertedCount).toBe(0);
    // No trial bucket anymore.
    expect(res.body).not.toHaveProperty('trial');
  });

  it('historical rows: plan/paid in the primary currency are counted, gaps stay unconverted', async () => {
    const base = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(base.status, base.text).toBe(200);
    const baselineCents = base.body[0].totalCents as number;

    const plan = await createPlan(5000, 'USD');
    const res = await createSubscription(tenant.organization.id, plan.id, 'USD', {});
    expect(res.status, res.text).toBe(201);

    // (a) plan already in the primary currency: backfill 1:1 with the snapshot.
    await testQuery(
      `UPDATE platform_subscription_payment
          SET plan_snapshot_price = 5000, plan_snapshot_currency = 'USD',
              amount_paid = 182500, currency_paid = 'VES',
              exchange_rate_applied = 36.5,
              platform_rate_applied = 1, platform_amount = 5000
        WHERE subscription_id = $1`,
      [res.body.id],
    );
    // (b) paid in the primary currency: the applied rate is the plan -> primary
    // hop and the amount is what was paid.
    await testQuery(
      `INSERT INTO platform_subscription_payment
         (subscription_id, organization_id, plan_id, plan_snapshot_name,
          plan_snapshot_price, plan_snapshot_currency,
          plan_snapshot_duration_value, plan_snapshot_duration_unit,
          amount_paid, currency_paid, exchange_rate_applied,
          platform_rate_applied, platform_amount,
          payment_method, status, payment_date, due_date)
       VALUES ($1, $2, $3, 'Plan histórico EUR', 10000, 'EUR', 1, 'month',
               9000, 'USD', 0.9, 0.9, 9000, 'zelle', 'validated', NOW(), NOW())`,
      [res.body.id, tenant.organization.id, plan.id],
    );
    // (c) neither hop reaches the primary currency: NULL, never assumed 1:1.
    await testQuery(
      `INSERT INTO platform_subscription_payment
         (subscription_id, organization_id, plan_id, plan_snapshot_name,
          plan_snapshot_price, plan_snapshot_currency,
          plan_snapshot_duration_value, plan_snapshot_duration_unit,
          amount_paid, currency_paid, exchange_rate_applied,
          platform_rate_applied, platform_amount,
          payment_method, status, payment_date, due_date)
       VALUES ($1, $2, $3, 'Plan histórico EUR pagado en EUR', 9000, 'EUR', 1, 'month',
               9000, 'EUR', 1, NULL, NULL, 'zelle', 'validated', NOW(), NOW())`,
      [res.body.id, tenant.organization.id, plan.id],
    );

    const after = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(after.status, after.text).toBe(200);
    // 5000 (plan=primary) + 9000 (paid=primary); the unconverted row adds 0.
    expect(after.body[0].totalCents).toBe(baselineCents + 14000);
    expect(after.body[0].unconvertedCount).toBe(1);

    // The invoice history exposes the normalized amount to the Console.
    const invoices = await admin.client.get(
      `/api/platform/subscriptions/by-organization/${tenant.organization.id}/invoices`,
    );
    expect(invoices.status, invoices.text).toBe(200);
    const rows = invoices.body as Array<{ platformAmount: number | null }>;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((row) => row.platformAmount === 9000)).toBe(true);
    expect(rows.some((row) => row.platformAmount === null)).toBe(true);

    const stats = await admin.client.get('/api/platform/subscriptions/stats');
    expect(stats.status, stats.text).toBe(200);
    // Both gaps are reported: the validated payment without a normalized
    // amount (revenue) and its active priced subscription whose latest
    // validated payment has no frozen rate (MRR cannot be expressed).
    expect(stats.body.unconvertedCount).toBe(2);
    // The unconverted subscription contributes 0 instead of an invented amount.
    expect(stats.body.mrrCents).toBe(10100);
  });

  it('freezes primary_currency once a SaaS payment exists (409)', async () => {
    const change = await admin.client.post('/api/platform/settings', {
      primary_currency: 'EUR',
    });
    expect(change.status, change.text).toBe(409);
    expect(change.body).toMatchObject({ code: 'PRIMARY_CURRENCY_IMMUTABLE' });

    // Re-writing the same value is not a change and stays allowed.
    const same = await admin.client.post('/api/platform/settings', {
      primary_currency: 'USD',
    });
    expect(same.status, same.text).toBe(200);

    const [setting] = await testQuery<{ value: string }>(
      `SELECT value FROM platform_setting WHERE key = 'primary_currency'`,
    );
    expect(setting!.value).toBe('USD');
  });

  it('freezes a plan currency once the plan has payments (409)', async () => {
    const plan = await createPlan(7000, 'USD');
    const created = await createSubscription(tenant.organization.id, plan.id, 'USD', {});
    expect(created.status, created.text).toBe(201);

    const change = await admin.client.put(`/api/platform/plans/${plan.id}`, {
      currency: 'VES',
    });
    expect(change.status, change.text).toBe(409);
    expect(change.body).toMatchObject({ code: 'PLAN_CURRENCY_IMMUTABLE' });

    // A plan without payments may still change its currency.
    const freePlan = await createPlan(1000, 'USD');
    const allowed = await admin.client.put(`/api/platform/plans/${freePlan.id}`, {
      currency: 'VES',
    });
    expect(allowed.status, allowed.text).toBe(200);
    expect(allowed.body.currency).toBe('VES');

    // Re-writing the same currency is not a change.
    const same = await admin.client.put(`/api/platform/plans/${plan.id}`, {
      currency: 'USD',
    });
    expect(same.status, same.text).toBe(200);
  });
});
