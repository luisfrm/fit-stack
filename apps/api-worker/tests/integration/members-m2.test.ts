/**
 * Members M2 integration tests.
 *
 * Covers: `?hasActiveSubscription=` filter on GET /api/members and the
 * additive stats fields — `growth` (local-month buckets) and
 * `upcomingBirthdays` (top 5 ordered by MM-DD).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';

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

describe.skipIf(skipReason !== null)('Members M2 — filter and extended stats', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('GET /api/members?hasActiveSubscription=', () => {
    it('returns only members with an active subscription', async () => {
      const tenant = await createGymTenant('m2-filter-true');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan M2' });
      const withSub = await createGymMember(tenant.owner.client, { firstName: 'ConSub' });
      await createGymMember(tenant.owner.client, { firstName: 'SinSub' });
      await createSubscription(tenant, withSub.id, plan.id, 30, 'validated');

      const res = await tenant.owner.client.get('/api/members', {
        query: { hasActiveSubscription: 'true', limit: '50' },
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].firstName).toBe('ConSub');
    });

    it('returns only members without an active subscription', async () => {
      const tenant = await createGymTenant('m2-filter-false');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan M2b' });
      const withSub = await createGymMember(tenant.owner.client, { firstName: 'ConSub' });
      const withoutSub = await createGymMember(tenant.owner.client, { firstName: 'SinSub' });
      await createSubscription(tenant, withSub.id, plan.id, 30, 'validated');

      const res = await tenant.owner.client.get('/api/members', {
        query: { hasActiveSubscription: 'false', limit: '50' },
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].firstName).toBe(withoutSub.firstName);
    });

    it('treats processing payments as active subscriptions', async () => {
      const tenant = await createGymTenant('m2-filter-proc');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan M2c' });
      const member = await createGymMember(tenant.owner.client, { firstName: 'EnProceso' });
      await createSubscription(tenant, member.id, plan.id, 30, 'processing');

      const active = await tenant.owner.client.get('/api/members', {
        query: { hasActiveSubscription: 'true', limit: '50' },
      });
      const inactive = await tenant.owner.client.get('/api/members', {
        query: { hasActiveSubscription: 'false', limit: '50' },
      });

      expect(active.status, active.text).toBe(200);
      expect(active.body.total).toBe(1);
      expect(inactive.status, inactive.text).toBe(200);
      expect(inactive.body.total).toBe(0);
    });
  });

  describe('GET /api/members/stats extended fields', () => {
    it('returns growth buckets for the current local month', async () => {
      const tenant = await createGymTenant('m2-growth');
      await createGymMember(tenant.owner.client, { firstName: 'AltaUno' });
      await createGymMember(tenant.owner.client, { firstName: 'AltaDos' });

      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body.growth)).toBe(true);
      const current = res.body.growth.find(
        (g: { month: string }) => typeof g.month === 'string' && /^\d{4}-\d{2}$/.test(g.month),
      );
      expect(current).toBeDefined();
      const total = res.body.growth.reduce(
        (acc: number, g: { count: number }) => acc + g.count,
        0,
      );
      expect(total).toBe(2);
    });

    it('returns upcoming birthdays ordered by MM-DD with year wrap', async () => {
      const tenant = await createGymTenant('m2-bday');
      // Fechas fijas: el orden MM-DD debe respetarse sin importar el año.
      await createGymMember(tenant.owner.client, { firstName: 'CumpleA', birthday: '1990-06-15' });
      await createGymMember(tenant.owner.client, { firstName: 'CumpleB', birthday: '1985-01-05' });
      await createGymMember(tenant.owner.client, { firstName: 'SinCumple' });

      const res = await tenant.owner.client.get('/api/members/stats');

      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body.upcomingBirthdays)).toBe(true);
      expect(res.body.upcomingBirthdays).toHaveLength(2);

      // Regla SQL: tramo futuro (MM-DD >= hoy) primero, luego MM-DD asc.
      const todayMD = new Date().toISOString().slice(5, 10);
      const rank = (md: string) => `${md >= todayMD ? '0' : '1'}${md}`;
      const monthDays = res.body.upcomingBirthdays.map(
        (b: { birthday: string }) => b.birthday.slice(5),
      );
      expect([...monthDays].sort((a: string, b: string) => (rank(a) < rank(b) ? -1 : 1))).toEqual(
        monthDays,
      );
      expect(res.body.upcomingBirthdays[0]).toHaveProperty('firstName');
    });
  });
});
