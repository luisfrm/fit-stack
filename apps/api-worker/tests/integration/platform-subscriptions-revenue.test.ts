/**
 * SaaS revenue series — GET /api/platform/subscriptions/revenue:
 *
 * - 401 without session; support reads (200); plain users 403
 * - `months` default 12, clamped to 1–24, zero-filled buckets
 * - only `validated` payments count; the booked amount is the PERSISTED
 *   `platform_amount` (server-priced in `platform_setting.primary_currency`)
 * - UTC month bucketing (a payment on the 15th of last month lands there)
 * - current-month bucket matches `GET /stats → monthlyRevenueCents`
 * - a row without `platform_amount` (unconverted) adds 0 and is counted in
 *   `unconvertedCount`, never assumed 1:1
 * - writes invalidate the cached series
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
} from '../helpers/db';
import {
  registerPlatformUser,
  registerUser,
  createGymTenant,
  uniqueEmail,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';

async function createPlatformPlan(admin: AuthedUser): Promise<any> {
  const res = await admin.client.post('/api/platform/plans', {
    name: `SaaS Plan ${uid()}`,
    price: 5000,
    currency: 'USD',
    durationValue: 1,
    durationUnit: 'month',
    isActive: true,
    features: {
      panel: { enabled: true },
      members_portal: { enabled: true, limits: { member_seats: 5 } },
      ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
    },
  });
  if (res.status !== 201) throw new Error(`create platform plan failed (${res.status}): ${res.text}`);
  return res.body;
}

async function createPlatformSubscription(
  admin: AuthedUser,
  organizationId: string,
  planId: number,
  payment: Record<string, unknown>,
): Promise<any> {
  const res = await admin.client.post('/api/platform/subscriptions', {
    organizationId,
    planId,
    startDate: payment.paymentDate,
    payment: {
      currencyPaid: 'USD',
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'validated',
      ...payment,
    },
  });
  if (res.status !== 201) throw new Error(`create platform subscription failed (${res.status}): ${res.text}`);
  return res.body;
}

/** YYYY-MM-DD for the 15th of the previous UTC month — never ambiguous. */
function prevMonthDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
    .toISOString()
    .slice(0, 10);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

describe.skipIf(skipReason !== null)('Platform subscriptions revenue', () => {
  let admin: AuthedUser;
  let support: AuthedUser;
  let plain: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    support = await registerPlatformUser('support');
    plain = await registerUser({ email: uniqueEmail('revenue-plain') });

    const plan = await createPlatformPlan(admin);
    const tenant = await createGymTenant('revenue-owner');

    // Current month: validated. The booked amount is the SERVER-priced
    // `platform_amount` (plan price in the platform primary currency).
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      status: 'validated',
      paymentDate: isoDate(0),
    });

    // Previous month: validated renewal. The booked amount is the plan price
    // (5000) whatever the operator could have stated.
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      status: 'validated',
      paymentDate: prevMonthDate(),
    });

    // Current month: processing → must be excluded.
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      status: 'processing',
      paymentDate: isoDate(0),
    });
  });

  it('rejects anonymous requests (401)', async () => {
    const res = await admin.client.get('/api/platform/subscriptions/revenue', {
      anonymous: true,
    });
    expect(res.status, res.text).toBe(401);
  });

  it('allows support to read and rejects plain users (403)', async () => {
    // `support` holds `subscription:list` in the platform RBAC matrix.
    const resSupport = await support.client.get('/api/platform/subscriptions/revenue');
    expect(resSupport.status, resSupport.text).toBe(200);

    const resPlain = await plain.client.get('/api/platform/subscriptions/revenue');
    expect(resPlain.status, resPlain.text).toBe(403);
  });

  it('returns 12 zero-filled buckets by default', async () => {
    const res = await admin.client.get('/api/platform/subscriptions/revenue');
    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveLength(12);
    for (const bucket of res.body) {
      expect(bucket).toHaveProperty('month');
      expect(bucket).toHaveProperty('totalCents');
      expect(bucket).toHaveProperty('count');
    }
    // Months strictly ascending.
    const months = res.body.map((b: { month: string }) => b.month);
    expect([...months].sort()).toEqual(months);
  });

  it('buckets validated payments by UTC month with the persisted platform amount', async () => {
    const res = await admin.client.get('/api/platform/subscriptions/revenue');
    expect(res.status, res.text).toBe(200);

    const now = new Date();
    const currentKey = monthKey(now);
    const prevKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));

    const current = res.body.find((b: { month: string }) => b.month === currentKey);
    const prev = res.body.find((b: { month: string }) => b.month === prevKey);

    // Current month: only the validated 5000 (processing excluded).
    expect(current.totalCents).toBe(5000);
    expect(current.count).toBe(1);
    expect(current.unconvertedCount).toBe(0);
    expect(current.primaryCurrency).toBe('USD');
    // Previous month: the plan price booked by the server.
    expect(prev.totalCents).toBe(5000);
    expect(prev.count).toBe(1);
  });

  it('matches the current-month bucket with GET /stats monthlyRevenueCents', async () => {
    const [revenueRes, statsRes] = await Promise.all([
      admin.client.get('/api/platform/subscriptions/revenue'),
      admin.client.get('/api/platform/subscriptions/stats'),
    ]);
    expect(revenueRes.status, revenueRes.text).toBe(200);
    expect(statsRes.status, statsRes.text).toBe(200);

    const currentKey = monthKey(new Date());
    const current = revenueRes.body.find((b: { month: string }) => b.month === currentKey);
    expect(current.totalCents).toBe(statsRes.body.monthlyRevenueCents);
  });

  it('respects and clamps the months param', async () => {
    const three = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '3' },
    });
    expect(three.status, three.text).toBe(200);
    expect(three.body).toHaveLength(3);

    const clamped = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '99' },
    });
    expect(clamped.status, clamped.text).toBe(200);
    expect(clamped.body).toHaveLength(24);
  });

  it('invalidates the cached series after a write', async () => {
    const first = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(first.status, first.text).toBe(200);
    const before = first.body[0].totalCents;

    const tenant = await createGymTenant('revenue-invalidate');
    const freshPlan = await createPlatformPlan(admin);
    await createPlatformSubscription(admin, tenant.organization.id, freshPlan.id, {
      status: 'validated',
      paymentDate: isoDate(0),
    });

    const second = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(second.status, second.text).toBe(200);
    // The booked amount is the server-priced plan price, not a stated one.
    expect(second.body[0].totalCents).toBe(before + 5000);
  });

  /**
   * RD-161: revenue reads the PERSISTED `platform_amount`. A validated payment
   * that could not be normalized (no rate to the primary currency) must not
   * inflate the KPI: it is excluded from the sum and reported as unconverted.
   */
  it('a validated payment without platform_amount does not inflate the KPI', async () => {
    const tenant = await createGymTenant('revenue-unconverted');
    const plan = await createPlatformPlan(admin);

    const base = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(base.status, base.text).toBe(200);
    const baseline = base.body[0].totalCents as number;

    // A priced registration books the platform amount.
    const sub = await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      status: 'validated',
      paymentDate: isoDate(0),
    });
    const paid = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(paid.body[0].totalCents).toBe(baseline + 5000);

    // Historical row whose normalization is unknown (backfill leaf NULL): the
    // amount must not be guessed from the plan price nor from the paid amount.
    await testQuery(
      `UPDATE platform_subscription_payment
          SET platform_rate_applied = NULL, platform_amount = NULL
        WHERE subscription_id = $1`,
      [sub.id],
    );

    const after = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(after.body[0].totalCents).toBe(baseline);
    expect(after.body[0].unconvertedCount).toBe(1);

    const stats = await admin.client.get('/api/platform/subscriptions/stats');
    expect(stats.status, stats.text).toBe(200);
    expect(stats.body.monthlyRevenueCents).toBe(baseline);
    // Two gaps, both reported: the validated payment without a normalized
    // amount AND its active priced subscription (no frozen rate => no MRR).
    expect(stats.body.unconvertedCount).toBe(2);
    expect(stats.body.primaryCurrency).toBe('USD');
  });
});
