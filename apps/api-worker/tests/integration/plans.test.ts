/**
 * Plans integration tests.
 *
 * Covers: full CRUD lifecycle for membership plans + permission enforcement.
 * Plans are the gym's product catalog (Monthly, Yearly, etc.).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createPlan,
  uid,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

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
      expect(res.body.price).toBe('99.00');
    });
  });

  describe('DELETE /api/plans/:id', () => {
    it('deletes a plan', async () => {
      const { owner } = await createGymTenant();
      const plan = await createPlan(owner.client);

      const del = await owner.client.delete(`/api/plans/${plan.id}`);
      expect(del.status, del.text).toBe(200);

      // Verify it's gone — GET /:id returns 404 for deleted plan
      const get = await owner.client.get(`/api/plans/${plan.id}`);
      expect(get.status, get.text).toBe(404);
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
