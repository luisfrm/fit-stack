/**
 * Org profile endpoints (console — organization detail page):
 *
 * - GET /api/platform/organizations/by-slug/:slug?includeMemberCount=
 * - GET /api/platform/subscriptions/by-organization/:orgId/invoices
 * - GET /api/platform/organizations/:id/gym-overview
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
  createGymMember,
  createPlan,
  uniqueEmail,
  uid,
  isoDate,
  type AuthedUser,
  type GymTenant,
} from '../helpers/auth';

async function createGymSubscription(
  tenant: GymTenant,
  memberId: number,
  planId: number,
): Promise<void> {
  const res = await tenant.owner.client.post('/api/subscriptions', {
    memberId,
    planId,
    startDate: isoDate(0),
    endDate: isoDate(30),
    payment: {
      amountPaid: 100,
      currencyPaid: 'USD',
      paymentMethod: 'cash',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(0),
    },
  });
  if (res.status !== 201) throw new Error(`create gym subscription failed (${res.status}): ${res.text}`);
}

async function createPlatformSubscription(
  admin: AuthedUser,
  organizationId: string,
): Promise<void> {
  const planRes = await admin.client.post('/api/platform/plans', {
    name: `SaaS Plan ${uid()}`,
    price: 5000,
    currency: 'USD',
    durationValue: 1,
    durationUnit: 'month',
    isActive: true,
    trialDays: 0,
    features: { panel: { enabled: true } },
  });
  if (planRes.status !== 201) throw new Error(`create platform plan failed (${planRes.status}): ${planRes.text}`);

  const subRes = await admin.client.post('/api/platform/subscriptions', {
    organizationId,
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
  if (subRes.status !== 201) throw new Error(`create platform subscription failed (${subRes.status}): ${subRes.text}`);
}

describe.skipIf(skipReason !== null)('Org profile endpoints', () => {
  let admin: AuthedUser;
  let support: AuthedUser;
  let plain: AuthedUser;
  let tenant: GymTenant;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    support = await registerPlatformUser('support');
    plain = await registerUser({ email: uniqueEmail('profile-plain') });

    tenant = await createGymTenant('profile-owner');
    const member = await createGymMember(tenant.owner.client);
    // Second member without subscription.
    await createGymMember(tenant.owner.client);
    const plan = await createPlan(tenant.owner.client);
    await createGymSubscription(tenant, member.id, plan.id);
    await createPlatformSubscription(admin, tenant.organization.id);
  });

  describe('GET /api/platform/organizations/by-slug/:slug', () => {
    it('returns 404 for an unknown slug', async () => {
      const res = await admin.client.get('/api/platform/organizations/by-slug/does-not-exist');
      expect(res.status, res.text).toBe(404);
    });

    it('omits member counts without the flag', async () => {
      const res = await admin.client.get(
        `/api/platform/organizations/by-slug/${tenant.organization.slug}`,
      );
      expect(res.status, res.text).toBe(200);
      expect(res.body).not.toHaveProperty('memberCount');
    });

    it('includes member counts with includeMemberCount=true', async () => {
      const res = await admin.client.get(
        `/api/platform/organizations/by-slug/${tenant.organization.slug}`,
        { query: { includeMemberCount: 'true' } },
      );
      expect(res.status, res.text).toBe(200);
      // 2 gym members created (owner is an auth member, not a gym member).
      expect(res.body.memberCount).toBe(2);
      expect(res.body.userCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/platform/subscriptions/by-organization/:orgId/invoices', () => {
    it('rejects anonymous requests (401)', async () => {
      const res = await admin.client.get(
        `/api/platform/subscriptions/by-organization/${tenant.organization.id}/invoices`,
        { anonymous: true },
      );
      expect(res.status, res.text).toBe(401);
    });

    it('rejects support and plain users (403)', async () => {
      const resSupport = await support.client.get(
        `/api/platform/subscriptions/by-organization/${tenant.organization.id}/invoices`,
      );
      expect(resSupport.status, resSupport.text).toBe(403);

      const resPlain = await plain.client.get(
        `/api/platform/subscriptions/by-organization/${tenant.organization.id}/invoices`,
      );
      expect(resPlain.status, resPlain.text).toBe(403);
    });

    it('returns the org invoices', async () => {
      const res = await admin.client.get(
        `/api/platform/subscriptions/by-organization/${tenant.organization.id}/invoices`,
      );
      expect(res.status, res.text).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const invoice of res.body) {
        expect(invoice.organizationId).toBe(tenant.organization.id);
      }
    });
  });

  describe('GET /api/platform/organizations/:id/gym-overview', () => {
    it('rejects anonymous requests (401)', async () => {
      const res = await admin.client.get(
        `/api/platform/organizations/${tenant.organization.id}/gym-overview`,
        { anonymous: true },
      );
      expect(res.status, res.text).toBe(401);
    });

    it('rejects support and plain users (403)', async () => {
      const resSupport = await support.client.get(
        `/api/platform/organizations/${tenant.organization.id}/gym-overview`,
      );
      expect(resSupport.status, resSupport.text).toBe(403);

      const resPlain = await plain.client.get(
        `/api/platform/organizations/${tenant.organization.id}/gym-overview`,
      );
      expect(resPlain.status, resPlain.text).toBe(403);
    });

    it('returns 404 for an unknown organization', async () => {
      const res = await admin.client.get('/api/platform/organizations/does-not-exist/gym-overview');
      expect(res.status, res.text).toBe(404);
    });

    it('aggregates gym adoption and portal seats', async () => {
      const res = await admin.client.get(
        `/api/platform/organizations/${tenant.organization.id}/gym-overview`,
      );
      expect(res.status, res.text).toBe(200);
      expect(res.body.totalMembers).toBe(2);
      expect(res.body.activeSubMembers).toBe(1);
      expect(res.body.portal).toMatchObject({ used: 0, pending: 0 });
      expect(res.body.portal).toHaveProperty('limit');
    });
  });
});
