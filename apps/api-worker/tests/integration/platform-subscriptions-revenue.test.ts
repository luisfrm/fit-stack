/**
 * SaaS revenue series — GET /api/platform/subscriptions/revenue:
 *
 * - 401 without session; 403 for support/plain users
 * - `months` default 12, clamped to 1–24, zero-filled buckets
 * - only `validated` payments count; `base_amount` is server-derived and
 *   `COALESCE(base_amount, amount_paid)` survives as the legacy fallback
 * - UTC month bucketing (a payment on the 15th of last month lands there)
 * - current-month bucket matches `GET /stats → monthlyRevenueCents`
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
    trialDays: 0,
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
    isTrial: false,
    payment: {
      amountPaidCents: 5000,
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

    // Current month: validated. The base amount is SERVER-derived from the
    // plan price, whatever the operator states as `amountPaidCents`.
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      amountPaidCents: 5000,
      status: 'validated',
      paymentDate: isoDate(0),
    });

    // Previous month: validated renewal. The base amount is the plan price
    // (5000) even though the operator charged 3000 in the paid currency.
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      amountPaidCents: 3000,
      status: 'validated',
      paymentDate: prevMonthDate(),
    });

    // Previous month: legacy row written BEFORE `base_amount` was
    // server-derived (NULL) → the KPI falls back to `amount_paid`.
    await testQuery(
      `INSERT INTO platform_subscription_payment
         (organization_id, plan_id, plan_snapshot_name, plan_snapshot_price,
          plan_snapshot_currency, plan_snapshot_duration_value,
          plan_snapshot_duration_unit, amount_paid, currency_paid, base_amount,
          payment_method, payment_date, due_date, status)
       VALUES ($1, $2, 'Plan legacy', 3000, 'USD', 1, 'month', 3000, 'USD',
          NULL, 'zelle', $3::timestamptz, $3::timestamptz, 'validated')`,
      [tenant.organization.id, plan.id, prevMonthDate()],
    );

    // Current month: processing → must be excluded.
    await createPlatformSubscription(admin, tenant.organization.id, plan.id, {
      amountPaidCents: 9999,
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

  it('rejects support and plain users (403)', async () => {
    const resSupport = await support.client.get('/api/platform/subscriptions/revenue');
    expect(resSupport.status, resSupport.text).toBe(403);

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

  it('buckets validated payments by UTC month with the server-derived base amount', async () => {
    const res = await admin.client.get('/api/platform/subscriptions/revenue');
    expect(res.status, res.text).toBe(200);

    const now = new Date();
    const currentKey = monthKey(now);
    const prevKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));

    const current = res.body.find((b: { month: string }) => b.month === currentKey);
    const prev = res.body.find((b: { month: string }) => b.month === prevKey);

    // Current month: only the validated 5000 (processing 9999 excluded).
    expect(current.totalCents).toBe(5000);
    expect(current.count).toBe(1);
    // Previous month: the plan price (5000, NOT the stated 3000) + the
    // legacy row without `base_amount`, which falls back to 3000.
    expect(prev.totalCents).toBe(8000);
    expect(prev.count).toBe(2);
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
      amountPaidCents: 1000,
      status: 'validated',
      paymentDate: isoDate(0),
    });

    const second = await admin.client.get('/api/platform/subscriptions/revenue', {
      query: { months: '1' },
    });
    expect(second.status, second.text).toBe(200);
    // The booked base amount is the plan price, not the stated 1000.
    expect(second.body[0].totalCents).toBe(before + 5000);
  });
});
