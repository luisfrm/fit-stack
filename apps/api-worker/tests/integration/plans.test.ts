/**
 * Plans integration tests.
 *
 * Covers: full CRUD lifecycle for membership plans + permission enforcement.
 * Plans are the gym's product catalog (Monthly, Yearly, etc.).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createGymMember,
  createPlan,
  isoDate,
  uid,
  type GymTenant,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

async function createSubscription(
  tenant: GymTenant,
  memberId: number,
  planId: number,
  endOffsetDays = 30,
) {
  return tenant.owner.client.post('/api/subscriptions', {
    memberId,
    planId,
    startDate: isoDate(0),
    endDate: isoDate(endOffsetDays),
    payment: {
      amountPaid: 100,
      currencyPaid: 'USD',
      paymentMethod: 'cash',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(0),
    },
  });
}

describe.skipIf(skipReason !== null)('Plans API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('POST /api/plans', () => {
    it('creates a membership plan with all required fields', async () => {
      const { owner } = await createGymTenant();
      const plan = await createPlan(owner.client);

      expect(plan).toHaveProperty('id');
      expect(plan.id).toBeGreaterThan(0);
      expect(plan.name).toBeDefined();
      expect(plan.price).toBeDefined();
    });

    it('rejects plan creation with missing name', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/plans', {
        price: 50,
        currency: 'USD',
        durationValue: 1,
        durationUnit: 'month',
      });

      // Zod validation rejects missing name
      expect(res.status, res.text).toBe(400);
    });

    it('rejects plan creation with invalid duration unit', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/plans', {
        name: `Plan ${uid()}`,
        price: 50,
        currency: 'USD',
        durationValue: 1,
        durationUnit: 'decade', // invalid
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects unauthenticated plan creation', async () => {
      const client = createClient();
      const res = await client.post('/api/plans', {
        name: `Plan ${uid()}`,
        price: 50,
        currency: 'USD',
        durationValue: 1,
        durationUnit: 'month',
      }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects plan creation by member without PLANS.CREATE', async () => {
      const { organization } = await createGymTenant();
      const member = await addUserToOrganization(organization.id, ORG_ROLES.MEMBER, 'plan-member');
      const res = await member.client.post('/api/plans', {
        name: `Plan ${uid()}`,
        price: 50,
        currency: 'USD',
        durationValue: 1,
        durationUnit: 'month',
      });

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('GET /api/plans', () => {
    it('returns all plans for the organization', async () => {
      const { owner } = await createGymTenant();
      await createPlan(owner.client, { name: 'Plan Alpha' });
      await createPlan(owner.client, { name: 'Plan Beta' });

      const res = await owner.client.get('/api/plans');
      expect(res.status, res.text).toBe(200);

      const plans = Array.isArray(res.body) ? res.body : res.body.data;
      expect(plans.length).toBeGreaterThanOrEqual(2);
    });

    it('returns a specific plan by id', async () => {
      const { owner } = await createGymTenant();
      const created = await createPlan(owner.client, { name: 'Unique Plan' });

      const res = await owner.client.get(`/api/plans/${created.id}`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.id).toBe(created.id);
    });
  });

  describe('PUT /api/plans/:id', () => {
    it('updates plan name', async () => {
      const { owner } = await createGymTenant();
      const plan = await createPlan(owner.client, { name: 'Old Name' });

      const res = await owner.client.put(`/api/plans/${plan.id}`, {
        name: 'New Name',
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('updates plan price', async () => {
      const { owner } = await createGymTenant();
      const plan = await createPlan(owner.client, { price: 25 });

      const res = await owner.client.put(`/api/plans/${plan.id}`, {
        price: 99,
      });

      expect(res.status, res.text).toBe(200);
      // bigint centavos: la API devuelve number, no string 'numeric'.
      expect(res.body.price).toBe(99);
    });
  });

  describe('DELETE /api/plans/:id', () => {
    it('soft-deletes a plan: row persists, hidden from GET and listing', async () => {
      const { owner } = await createGymTenant('plan-del-soft');
      const plan = await createPlan(owner.client);

      const del = await owner.client.delete(`/api/plans/${plan.id}`);
      expect(del.status, del.text).toBe(200);
      expect(del.body).toEqual({ success: true });

      // GET /:id returns 404 for a soft-deleted plan.
      const get = await owner.client.get(`/api/plans/${plan.id}`);
      expect(get.status, get.text).toBe(404);

      // The row still exists; only `deleted_at` is set.
      const rows = await testQuery<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM membership_plan WHERE id = $1`,
        [plan.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deleted_at).not.toBeNull();

      // Absent from the listing.
      const list = await owner.client.get('/api/plans');
      const plans = Array.isArray(list.body) ? list.body : list.body.data;
      expect(plans.map((p: { id: number }) => p.id)).not.toContain(plan.id);
    });

    it('is idempotent: re-deleting an already-deleted plan returns 200', async () => {
      const { owner } = await createGymTenant('plan-del-idem');
      const plan = await createPlan(owner.client);

      const first = await owner.client.delete(`/api/plans/${plan.id}`);
      expect(first.status, first.text).toBe(200);
      const second = await owner.client.delete(`/api/plans/${plan.id}`);
      expect(second.status, second.text).toBe(200);
      expect(second.body).toEqual({ success: true });
    });

    it('returns 404 when the plan does not exist', async () => {
      const { owner } = await createGymTenant('plan-del-missing');
      const res = await owner.client.delete('/api/plans/999999999');
      expect(res.status, res.text).toBe(404);
    });

    it('soft-deletes a plan with subscriptions: no FK error, history preserved', async () => {
      const tenant = await createGymTenant('plan-del-history');
      const member = await createGymMember(tenant.owner.client);
      const plan = await createPlan(tenant.owner.client, { price: 100, currency: 'USD' });
      const sub = await createSubscription(tenant, member.id, plan.id);
      expect(sub.status, sub.text).toBe(201);

      const del = await tenant.owner.client.delete(`/api/plans/${plan.id}`);
      expect(del.status, del.text).toBe(200);

      // Financial history is intact.
      const subs = await testQuery(`SELECT id FROM subscription WHERE plan_id = $1`, [plan.id]);
      const pays = await testQuery(`SELECT id FROM payment WHERE subscription_id = $1`, [sub.body.id]);
      expect(subs).toHaveLength(1);
      expect(pays).toHaveLength(1);

      // Historical JOIN still resolves the plan name.
      const list = await tenant.owner.client.get('/api/subscriptions', { query: { limit: '50' } });
      expect(list.status, list.text).toBe(200);
      const row = list.body.data.find((r: { id: number }) => r.id === sub.body.id);
      expect(row).toBeDefined();
      expect(row.planName).toBe(plan.name);
    });

    it('keeps an inactive (draft) plan visible with its badge state', async () => {
      const { owner } = await createGymTenant('plan-del-inactive');
      const plan = await createPlan(owner.client, { isActive: false });

      const get = await owner.client.get(`/api/plans/${plan.id}`);
      expect(get.status, get.text).toBe(200);
      expect(get.body.isActive).toBe(false);

      const list = await owner.client.get('/api/plans');
      const plans = Array.isArray(list.body) ? list.body : list.body.data;
      expect(plans.map((p: { id: number }) => p.id)).toContain(plan.id);
    });

    it('database rejects a direct hard delete of a plan with subscriptions (restrict)', async () => {
      const tenant = await createGymTenant('plan-del-restrict');
      const member = await createGymMember(tenant.owner.client);
      const plan = await createPlan(tenant.owner.client, { price: 100, currency: 'USD' });
      const sub = await createSubscription(tenant, member.id, plan.id);
      expect(sub.status, sub.text).toBe(201);

      await expect(
        testQuery(`DELETE FROM membership_plan WHERE id = $1`, [plan.id]),
      ).rejects.toThrow();
    });

    it('rejects delete by member without PLANS.DELETE', async () => {
      const { organization } = await createGymTenant();
      const plan = await createPlan(
        (await addUserToOrganization(organization.id, ORG_ROLES.MANAGER, 'plan-mgr')).client,
      );
      const cashier = await addUserToOrganization(organization.id, ORG_ROLES.CASHIER, 'plan-cashier');
      const res = await cashier.client.delete(`/api/plans/${plan.id}`);

      // Cashier has READ but not DELETE
      expect(res.status, res.text).toBe(403);
    });
  });

  describe('Organization isolation', () => {
    it('org A cannot see org B plans', async () => {
      const tenant1 = await createGymTenant('plans-a');
      const tenant2 = await createGymTenant('plans-b');

      await createPlan(tenant1.owner.client, { name: 'Plan A' });
      await createPlan(tenant2.owner.client, { name: 'Plan B' });

      const res1 = await tenant1.owner.client.get('/api/plans');
      const res2 = await tenant2.owner.client.get('/api/plans');

      const plans1 = Array.isArray(res1.body) ? res1.body : res1.body.data;
      const plans2 = Array.isArray(res2.body) ? res2.body : res2.body.data;

      expect(plans1.every((p: any) => p.name === 'Plan A')).toBe(true);
      expect(plans2.every((p: any) => p.name === 'Plan B')).toBe(true);
    });

    it('org A cannot update org B plan', async () => {
      const tenant1 = await createGymTenant('iso-a');
      const tenant2 = await createGymTenant('iso-b');

      const planB = await createPlan(tenant2.owner.client, { name: 'Plan B Original' });
      const res = await tenant1.owner.client.put(`/api/plans/${planB.id}`, {
        name: 'Hacked Plan',
      });

      // Cross-org id is not visible — 404 (not a 200 with the updated plan)
      expect(res.status, res.text).toBe(404);
    });
  });
});
