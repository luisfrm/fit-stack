/**
 * Members stats integration tests.
 *
 * Covers: GET /api/members/stats — KPI aggregates scoped to `role = 'member'`,
 * local-month cut for `newThisMonth`, active-subscription semantics
 * (`processing` counts as active, documented in the repository) and the
 * `withPortal` mirror of `countActivePortalUsers`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  addUserToOrganization,
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

async function createSubscription(
  tenant: GymTenant,
  memberId: number,
  planId: number,
  endOffsetDays: number,
  status: 'validated' | 'processing' = 'validated',
) {
  const res = await tenant.owner.client.post('/api/subscriptions', {
    memberId,
    planId,
    startDate: isoDate(0),
    endDate: isoDate(endOffsetDays),
    payment: {
      amountPaid: 100,
      currencyPaid: 'USD',
      paymentMethod: 'cash',
      paymentMethodDetails: [],
      status,
      paymentDate: isoDate(0),
    },
  });
  if (res.status !== 201) throw new Error(`create subscription failed: ${res.text}`);
  return res.body;
}

describe.skipIf(skipReason !== null)('Members stats API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('GET /api/members/stats', () => {
    it('returns zeros for a fresh tenant', async () => {
      const tenant = await createGymTenant('stats-empty');
      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({
        total: 0,
        active: 0,
        inactive: 0,
        newThisMonth: 0,
        withoutActiveSubscription: 0,
        withPortal: 0,
        growth: [],
        upcomingBirthdays: [],
      });
    });

    it('counts total/active/inactive/newThisMonth scoped to role member', async () => {
      const tenant = await createGymTenant('stats-counts');
      await createGymMember(tenant.owner.client, { firstName: 'ActUno' });
      await createGymMember(tenant.owner.client, { firstName: 'ActDos' });
      await createGymMember(tenant.owner.client, { firstName: 'Inactivo', isActive: false });
      // Staff (coach) must not leak into client KPIs.
      await createGymMember(tenant.owner.client, { firstName: 'Profe', role: ORG_ROLES.COACH });

      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.active).toBe(2);
      expect(res.body.inactive).toBe(1);
      expect(res.body.newThisMonth).toBe(3);
      expect(res.body.withoutActiveSubscription).toBe(3);
      expect(res.body.withPortal).toBe(0);
    });

    it('excludes members with validated AND processing subs from withoutActiveSubscription', async () => {
      const tenant = await createGymTenant('stats-subs');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan Stats' });
      const validated = await createGymMember(tenant.owner.client, { firstName: 'Validado' });
      const processing = await createGymMember(tenant.owner.client, { firstName: 'EnProceso' });
      const expired = await createGymMember(tenant.owner.client, { firstName: 'Vencido' });
      const plain = await createGymMember(tenant.owner.client, { firstName: 'SinSub' });

      await createSubscription(tenant, validated.id, plan.id, 30, 'validated');
      // `processing` counts as gym-active: access not revoked yet.
      await createSubscription(tenant, processing.id, plan.id, 30, 'processing');
      await createSubscription(tenant, expired.id, plan.id, -5, 'validated');

      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      expect(res.body.total).toBe(4);
      // Expired + plain have no active subscription.
      expect(res.body.withoutActiveSubscription).toBe(2);
    });

    it('withPortal counts linked active member accounts only', async () => {
      const tenant = await createGymTenant('stats-portal');
      const linked = await createGymMember(tenant.owner.client, { firstName: 'Vinculado' });
      const linkedInactive = await createGymMember(tenant.owner.client, {
        firstName: 'VinculadoInactivo',
        isActive: false,
      });

      await testQuery(`UPDATE "gym_member" SET "user_id" = $1 WHERE "id" = $2`, [
        tenant.owner.userId,
        linked.id,
      ]);
      await testQuery(`UPDATE "gym_member" SET "user_id" = $1 WHERE "id" = $2`, [
        tenant.owner.userId,
        linkedInactive.id,
      ]);

      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      // Inactive linked account does not use a portal seat.
      expect(res.body.withPortal).toBe(1);
    });

    it('rejects unauthenticated requests', async () => {
      const client = createClient();
      const res = await client.get('/api/members/stats', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects member role without MEMBERS.READ', async () => {
      const { organization } = await createGymTenant('stats-guard');
      const member = await addUserToOrganization(organization.id, ORG_ROLES.MEMBER, 'stats-guard-member');
      const res = await member.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(403);
    });
  });
});
