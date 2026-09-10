/**
 * Platform AI usage read — GET /api/platform/organizations/:id/ai-usage:
 *
 * - 401 without session; 403 for support/plain users; 404 for unknown org
 * - returns the same quota shape as POST /:id/ai-credits
 * - the grant endpoint invalidates the cached quota
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaReady,
  skipReason,
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

describe.skipIf(skipReason !== null)('Platform AI usage read', () => {
  let admin: AuthedUser;
  let support: AuthedUser;
  let plain: AuthedUser;
  let orgId: string;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    support = await registerPlatformUser('support');
    plain = await registerUser({ email: uniqueEmail('ai-usage-plain') });

    const tenant = await createGymTenant('ai-usage-owner');
    orgId = tenant.organization.id;

    // Plan with ai_chat so the org has a nonzero base limit for the grant to boost.
    const planRes = await admin.client.post('/api/platform/plans', {
      name: `SaaS AI Plan ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
      features: {
        panel: { enabled: true },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    if (planRes.status !== 201) throw new Error(`create plan failed (${planRes.status}): ${planRes.text}`);

    const subRes = await admin.client.post('/api/platform/subscriptions', {
      organizationId: orgId,
      planId: planRes.body.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    if (subRes.status !== 201) throw new Error(`create subscription failed (${subRes.status}): ${subRes.text}`);
  });

  it('rejects anonymous requests (401)', async () => {
    const res = await admin.client.get(`/api/platform/organizations/${orgId}/ai-usage`, {
      anonymous: true,
    });
    expect(res.status, res.text).toBe(401);
  });

  it('rejects support and plain users (403)', async () => {
    const resSupport = await support.client.get(`/api/platform/organizations/${orgId}/ai-usage`);
    expect(resSupport.status, resSupport.text).toBe(403);

    const resPlain = await plain.client.get(`/api/platform/organizations/${orgId}/ai-usage`);
    expect(resPlain.status, resPlain.text).toBe(403);
  });

  it('returns 404 for an unknown organization', async () => {
    const res = await admin.client.get('/api/platform/organizations/does-not-exist/ai-usage');
    expect(res.status, res.text).toBe(404);
  });

  it('returns the quota shape', async () => {
    const res = await admin.client.get(`/api/platform/organizations/${orgId}/ai-usage`);
    expect(res.status, res.text).toBe(200);
    expect(res.body.monthly).toHaveProperty('used');
    expect(res.body.monthly).toHaveProperty('limit');
    expect(res.body).toHaveProperty('remaining');
    expect(res.body).toHaveProperty('disabled');
    expect(res.body).toHaveProperty('periodStart');
  });

  it('reflects a grant (cache invalidated by POST /ai-credits)', async () => {
    const before = await admin.client.get(`/api/platform/organizations/${orgId}/ai-usage`);
    expect(before.status, before.text).toBe(200);

    const grant = await admin.client.post(`/api/platform/organizations/${orgId}/ai-credits`, {
      credits: 250,
    });
    expect(grant.status, grant.text).toBe(200);

    const after = await admin.client.get(`/api/platform/organizations/${orgId}/ai-usage`);
    expect(after.status, after.text).toBe(200);
    expect(after.body.monthly.limit).toBe(before.body.monthly.limit + 250);
  });
});
