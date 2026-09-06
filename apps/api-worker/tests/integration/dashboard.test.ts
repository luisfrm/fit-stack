/**
 * Dashboard action-items integration tests.
 *
 * Covers: GET /api/dashboard/action-items — expiring soon / recently expired
 * lists, permission enforcement (coach → 403) and org isolation.
 *
 * Flow tested: create member → create plan → POST /api/subscriptions (atomic) → GET action-items
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  addUserToOrganization,
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';

/** Sub window relative to today (endpoint computes against `new Date()`). */
function subWindow(endOffsetDays: number) {
  return { startDate: isoDate(0), endDate: isoDate(endOffsetDays) };
}

async function createSubscription(
  tenant: GymTenant,
  memberId: number,
  planId: number,
  endOffsetDays: number,
  status: 'validated' | 'processing' = 'validated',
) {
  const { startDate, endDate } = subWindow(endOffsetDays);
  const res = await tenant.owner.client.post('/api/subscriptions', {
    memberId,
    planId,
    startDate,
    endDate,
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

describe.skipIf(skipReason !== null)('Dashboard action-items API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('GET /api/dashboard/action-items', () => {
    it('returns expiring members (sub ends within 7 days) sorted by endDate asc', async () => {
      const tenant = await createGymTenant('dash-exp');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan Vence' });

      const expiring = await createGymMember(tenant.owner.client);
      const farAway = await createGymMember(tenant.owner.client);

      await createSubscription(tenant, expiring.id, plan.id, 5);
      await createSubscription(tenant, farAway.id, plan.id, 40);

      const res = await tenant.owner.client.get('/api/dashboard/action-items');
      expect(res.status, res.text).toBe(200);
      expect(res.body).toHaveProperty('expiring');
      expect(res.body).toHaveProperty('recentlyExpired');

      const ids = res.body.expiring.map((i: { memberId: number }) => i.memberId);
      expect(ids).toContain(expiring.id);
      expect(ids).not.toContain(farAway.id);

      const row = res.body.expiring.find(
        (i: { memberId: number }) => i.memberId === expiring.id,
      );
      expect(row.days).toBeGreaterThanOrEqual(4); // ~5 días, margen por timing
      expect(row.days).toBeLessThanOrEqual(6);
      expect(row.memberName).toContain('Ana');
      expect(row.planName).toBe(plan.name);
      expect(row.endDate).toBeDefined();
    });

    it('returns recently expired members (last 7 days, no renewal) with negative days', async () => {
      const tenant = await createGymTenant('dash-expired');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan Vencido' });

      const expired = await createGymMember(tenant.owner.client);
      const renewed = await createGymMember(tenant.owner.client);

      // Venció hace 3 días (end en el pasado) — el API no permite endDate pasado?
      // Sí lo permite: valida solo que endDate > startDate, no contra hoy.
      await createSubscription(tenant, expired.id, plan.id, -3);
      // Venció y renovó: segunda sub activa → NO debe aparecer.
      await createSubscription(tenant, renewed.id, plan.id, -5);
      await createSubscription(tenant, renewed.id, plan.id, 30);

      const res = await tenant.owner.client.get('/api/dashboard/action-items');
      expect(res.status, res.text).toBe(200);

      const expiredIds = res.body.recentlyExpired.map((i: { memberId: number }) => i.memberId);
      expect(expiredIds).toContain(expired.id);
      expect(expiredIds).not.toContain(renewed.id);

      const row = res.body.recentlyExpired.find(
        (i: { memberId: number }) => i.memberId === expired.id,
      );
      expect(row.days).toBeLessThanOrEqual(-3); // negativo = venció hace N días
      expect(row.days).toBeGreaterThanOrEqual(-4);
    });

    it('ignores processing payments (no validated sub → not listed)', async () => {
      const tenant = await createGymTenant('dash-proc');
      const plan = await createPlan(tenant.owner.client);

      const member = await createGymMember(tenant.owner.client);
      await createSubscription(tenant, member.id, plan.id, 5, 'processing');

      const res = await tenant.owner.client.get('/api/dashboard/action-items');
      expect(res.status, res.text).toBe(200);
      const ids = res.body.expiring.map((i: { memberId: number }) => i.memberId);
      expect(ids).not.toContain(member.id);
    });

    it('rejects coach with 403 (DASHBOARD module)', async () => {
      const tenant = await createGymTenant('dash-coach');
      const coach = await addUserToOrganization(tenant.organization.id, 'coach', 'dash-coach');

      const res = await coach.client.get('/api/dashboard/action-items');
      expect(res.status).toBe(403);
    });

    it('isolates by organization (other gym members never leak)', async () => {
      const gymA = await createGymTenant('dash-iso-a');
      const gymB = await createGymTenant('dash-iso-b');

      const planA = await createPlan(gymA.owner.client);
      const memberA = await createGymMember(gymA.owner.client);
      await createSubscription(gymA, memberA.id, planA.id, 4);

      const planB = await createPlan(gymB.owner.client);
      const memberB = await createGymMember(gymB.owner.client);
      await createSubscription(gymB, memberB.id, planB.id, 4);

      const resA = await gymA.owner.client.get('/api/dashboard/action-items');
      expect(resA.status, resA.text).toBe(200);
      const idsA = resA.body.expiring.map((i: { memberId: number }) => i.memberId);
      expect(idsA).toContain(memberA.id);
      expect(idsA).not.toContain(memberB.id);

      const resB = await gymB.owner.client.get('/api/dashboard/action-items');
      const idsB = resB.body.expiring.map((i: { memberId: number }) => i.memberId);
      expect(idsB).toContain(memberB.id);
      expect(idsB).not.toContain(memberA.id);
    });
  });
});
