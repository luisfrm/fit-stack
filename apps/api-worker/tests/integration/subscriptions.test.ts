/**
 * Subscriptions integration tests.
 *
 * Covers: the full subscription lifecycle — create (with atomic payment),
 * list, cancel — plus permission enforcement and org isolation.
 *
 * Flow tested: create member → create plan → POST /api/subscriptions (atomic)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createGymMember,
  createPlan,
  isoDate,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Subscriptions API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Helper: create a member + plan and return their IDs for subscription tests. */
  async function setupSubscriptionFixture() {
    const { owner, organization } = await createGymTenant();
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 100, currency: 'USD' });
    return { owner, organization, member, plan };
  }

  describe('POST /api/subscriptions', () => {
    it('creates a subscription with atomic payment', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [
            { label: 'Referencia', value: 'REF-123', type: 'text' },
          ],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.memberId).toBe(member.id);
      expect(res.body.planId).toBe(plan.id);
    });

    it('rejects object-shaped paymentMethodDetails (contract is an array)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: { reference: 'REF-123' },
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(400);
    });

    it('returns the created subscription with correct IDs', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 50,
          currencyPaid: 'USD',
          paymentMethod: 'zelle',
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body.memberId).toBe(member.id);
      expect(res.body.planId).toBe(plan.id);
    });

    it('rejects creation with invalid memberId', async () => {
      const { owner, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: 999999,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
        },
      });

      // memberId doesn't exist in this org — 400 with error envelope, not a FK crash
      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects creation with invalid planId', async () => {
      const { owner, member } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: 999999,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          amountPaid: 100,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
        },
      });

      // planId doesn't exist in this org — 400 with error envelope, not a FK crash
      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects creation with missing payment', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const res = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects unauthenticated creation', async () => {
      const client = createClient();
      const res = await client.post('/api/subscriptions', {
        memberId: 1,
        planId: 1,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });
  });

  describe('GET /api/subscriptions', () => {
    it('returns paginated subscriptions', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      // Create two subscriptions
      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });
      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(31),
        endDate: isoDate(61),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res = await owner.client.get('/api/subscriptions');
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty('total');
    });

    it('returns recent subscriptions', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res = await owner.client.get('/api/subscriptions/recent', { query: { limit: '3' } });
      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /api/subscriptions/:id', () => {
    it('cancels an active subscription (sets cancelledAt)', async () => {
      const { owner, member, plan } = await setupSubscriptionFixture();

      const created = await owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const subId = created.body.id;
      const res = await owner.client.put(`/api/subscriptions/${subId}`, {
        status: 'cancelled',
      });

      expect(res.status, res.text).toBe(200);
      // The API returns the raw subscription row; cancelledAt is set to now
      expect(res.body.cancelledAt).not.toBeNull();
    });
  });

  describe('Organization isolation', () => {
    it('org A cannot see org B subscriptions', async () => {
      const tenant1 = await createGymTenant('sub-iso-a');
      const tenant2 = await createGymTenant('sub-iso-b');

      const member1 = await createGymMember(tenant1.owner.client);
      const plan1 = await createPlan(tenant1.owner.client);
      const member2 = await createGymMember(tenant2.owner.client);
      const plan2 = await createPlan(tenant2.owner.client);

      await tenant1.owner.client.post('/api/subscriptions', {
        memberId: member1.id,
        planId: plan1.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });
      await tenant2.owner.client.post('/api/subscriptions', {
        memberId: member2.id,
        planId: plan2.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: { amountPaid: 50, currencyPaid: 'USD', paymentMethod: 'cash' },
      });

      const res1 = await tenant1.owner.client.get('/api/subscriptions');
      const res2 = await tenant2.owner.client.get('/api/subscriptions');

      // Each org should only see their own subscription
      expect(res1.body.data.length).toBe(1);
      expect(res2.body.data.length).toBe(1);
    });
  });
});
