/**
 * Features / Free tier integration tests.
 *
 * Covers: /api/platform/features (catálogo), /api/organizations/features
 * (resolución: plan activo → features del plan; sin plan/suspendido + free
 * tier seteado → piso gratuito), /api/organizations/seats (cupos del portal),
 * /api/ai/usage (cuotas), guard de cupos al invitar miembros y snapshot de
 * features en platform_subscription_payment.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { testQuery, assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  registerPlatformUser,
  registerUser,
  createGymTenant,
  createGymMember,
  uid,
  uniqueEmail,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

const FREE_TIER_KEY = 'feature_flags_free_tier';
const FREE_TIER_ENABLED_KEY = 'feature_flags_free_tier_enabled';

/** Borra el setting del free tier para aislamiento determinístico entre tests. */
async function clearFreeTierSetting(): Promise<void> {
  await testQuery(`DELETE FROM platform_setting WHERE key IN ($1, $2)`, [
    FREE_TIER_KEY,
    FREE_TIER_ENABLED_KEY,
  ]);
}

const FREE_TIER_SETTING = JSON.stringify({
  panel: { enabled: true },
  members_portal: { enabled: true, limits: { member_seats: 10 } },
  ai_chat: { enabled: true, limits: { ai_credits_monthly: 500 } },
});

/** Habilita el free tier: flag enabled + features. */
async function enableFreeTier(admin: AuthedUser): Promise<void> {
  await admin.client.post('/api/platform/settings', {
    [FREE_TIER_ENABLED_KEY]: 'true',
    [FREE_TIER_KEY]: FREE_TIER_SETTING,
  });
}

async function createPlatformPlan(
  admin: AuthedUser,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await admin.client.post('/api/platform/plans', {
    name: `SaaS Plan ${uid()}`,
    price: 2999,
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
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create platform plan failed (${res.status}): ${res.text}`);
  return res.body;
}

async function createPlatformSubscription(
  admin: AuthedUser,
  organizationId: string,
  planId: number,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await admin.client.post('/api/platform/subscriptions', {
    organizationId,
    planId,
    startDate: isoDate(-1),
    isTrial: false,
    payment: {
      amountPaidCents: 2999,
      currencyPaid: 'USD',
      baseAmountCents: 2999,
      paymentMethod: 'card',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(-1),
    },
    ...overrides,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`create platform subscription failed (${res.status}): ${res.text}`);
  }
  return res.body;
}

describe.skipIf(skipReason !== null)('Features & Free tier', () => {
  let admin: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    admin = await registerPlatformUser('admin');
  });

  describe('GET /api/platform/features', () => {
    it('returns the feature catalog for admin', async () => {
      const res = await admin.client.get('/api/platform/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.catalog).toBeDefined();
      expect(res.body.catalog.cms).toBeDefined();
      expect(res.body.catalog.members_portal).toBeDefined();
      expect(res.body.catalog.ai_chat).toBeDefined();
      expect(res.body.version).toBe(1);
    });

    it('rejects non-platform users', async () => {
      const user = await registerUser();
      const res = await user.client.get('/api/platform/features');
      expect(res.status, res.text).toBe(403);
    });
  });

  describe('Platform plan features validation', () => {
    it('rejects unknown feature ids', async () => {
      const res = await admin.client.post('/api/platform/plans', {
        name: `Bad ${uid()}`,
        price: 1000,
        currency: 'USD',
        features: { not_a_feature: { enabled: true } },
      });
      expect(res.status, res.text).toBe(400);
    });

    it('creates a plan with valid features', async () => {
      const plan = await createPlatformPlan(admin);
      expect(plan.features.members_portal.limits.member_seats).toBe(5);
    });

    it('normalizes features on update (PUT)', async () => {
      const plan = await createPlatformPlan(admin);
      const res = await admin.client.put(`/api/platform/plans/${plan.id}`, {
        features: { cms: { enabled: true } },
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.features.cms.enabled).toBe(true);
    });

    it('accepts PATCH as alias of PUT', async () => {
      const plan = await createPlatformPlan(admin);
      const res = await admin.client.patch(`/api/platform/plans/${plan.id}`, {
        features: { ai_chat: { enabled: true, limits: { ai_credits_monthly: 3000 } } },
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.features.ai_chat.limits.ai_credits_monthly).toBe(3000);
    });
  });

  describe('GET /api/organizations/features (resolution)', () => {
    it('no subscription + no free tier → legacy gate (suspended, not free)', async () => {
      await clearFreeTierSetting();
      const { owner, organization } = await createGymTenant();
      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.subscriptionStatus).toBe('suspended');
      expect(res.body.isFreeTier).toBe(false);
    });

    it('no subscription + free tier enabled → free tier features', async () => {
      const { owner, organization } = await createGymTenant();
      await enableFreeTier(admin);

      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.isFreeTier).toBe(true);
      expect(res.body.features.panel.enabled).toBe(true);
      expect(res.body.features.members_portal.limits.member_seats).toBe(10);
      expect(res.body.features.ai_chat.limits.ai_credits_monthly).toBe(500);
      expect(res.body.limits.member_seats).toBe(10);
    });

    it('free tier setting without enabled flag → legacy gate (not free)', async () => {
      await clearFreeTierSetting();
      const { owner, organization } = await createGymTenant();
      await admin.client.post('/api/platform/settings', { [FREE_TIER_KEY]: FREE_TIER_SETTING });

      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.isFreeTier).toBe(false);
      expect(res.body.subscriptionStatus).toBe('suspended');
    });

    it('active subscription → plan features (not free tier)', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin);
      await createPlatformSubscription(admin, organization.id, plan.id);

      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.isFreeTier).toBe(false);
      expect(res.body.features.members_portal.limits.member_seats).toBe(5);
      expect(res.body.features.ai_chat.limits.ai_credits_monthly).toBe(1500);
      expect(res.body.planId).toBe(String(plan.id));
      expect(res.body.planName).toBe(plan.name);
    });

    it('overdue subscription + free tier enabled → free tier floor', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin);
      const sub = await createPlatformSubscription(admin, organization.id, plan.id);
      await testQuery(`UPDATE platform_subscription SET current_period_end = NOW() - INTERVAL '20 days' WHERE id = $1`, [sub.id]);
      await enableFreeTier(admin);

      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.subscriptionStatus).toBe('suspended');
      expect(res.body.isFreeTier).toBe(true);
      expect(res.body.features.members_portal.limits.member_seats).toBe(10);
    });

    it('suspended subscription + no free tier → legacy gate (no free features)', async () => {
      await clearFreeTierSetting();
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin);
      const sub = await createPlatformSubscription(admin, organization.id, plan.id);
      await testQuery(`UPDATE platform_subscription SET current_period_end = NOW() - INTERVAL '20 days' WHERE id = $1`, [sub.id]);

      const res = await owner.client.get('/api/organizations/features');
      expect(res.status, res.text).toBe(200);
      expect(res.body.subscriptionStatus).toBe('suspended');
      expect(res.body.isFreeTier).toBe(false);
    });
  });

  describe('Seats del portal (members_portal)', () => {
    it('plan sin members_portal → limit 0', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: { panel: { enabled: true } },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      const res = await owner.client.get('/api/organizations/seats');
      expect(res.status, res.text).toBe(200);
      expect(res.body.limit).toBe(0);
    });

    it('cuenta activos con cuenta + invitaciones pendientes', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: {
          panel: { enabled: true },
          members_portal: { enabled: true, limits: { member_seats: 5 } },
        },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      // 2 miembros con cuenta vinculada (seats usados)
      const m1 = await createGymMember(owner.client);
      const m2 = await createGymMember(owner.client);
      const linkedUser = await registerUser();
      await testQuery(`UPDATE gym_member SET user_id = $1 WHERE id = $2`, [linkedUser.userId, m1.id]);
      await testQuery(`UPDATE gym_member SET user_id = $1 WHERE id = $2`, [linkedUser.userId, m2.id]);
      await testQuery(`UPDATE gym_member SET is_active = true WHERE id IN ($1, $2)`, [m1.id, m2.id]);

      // 1 invitación pendiente
      await testQuery(
        `INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id)
         VALUES ($1, $2, $3, 'member', 'pending', NOW() + INTERVAL '7 days', $4)`,
        [uid('inv-'), organization.id, uniqueEmail('invited'), owner.userId],
      );

      const res = await owner.client.get('/api/organizations/seats');
      expect(res.status, res.text).toBe(200);
      expect(res.body.used).toBe(2);
      expect(res.body.pending).toBe(1);
      expect(res.body.limit).toBe(5);
    });

    it('bloquea invitar clientes cuando se alcanza el límite', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: {
          panel: { enabled: true },
          members_portal: { enabled: true, limits: { member_seats: 1 } },
        },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      // 1 pending → used+pending = 1 = limit → siguiente invitación bloqueada
      await testQuery(
        `INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id)
         VALUES ($1, $2, $3, 'member', 'pending', NOW() + INTERVAL '7 days', $4)`,
        [uid('inv-'), organization.id, uniqueEmail('invited'), owner.userId],
      );

      const res = await owner.client.post('/api/members', {
        firstName: 'Luis',
        lastName: 'Rivas',
        email: uniqueEmail('blocked'),
        role: ORG_ROLES.MEMBER,
        isActive: true,
        sendInvite: true,
      });
      expect(res.status, res.text).toBe(403);
      expect(res.body.code).toBe('FEATURE_LIMIT_REACHED');
    });

    it('no bloquea invitaciones de staff (roles no member)', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: {
          panel: { enabled: true },
          members_portal: { enabled: true, limits: { member_seats: 0 } },
        },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      const res = await owner.client.post('/api/members', {
        firstName: 'Staff',
        lastName: 'One',
        email: uniqueEmail('staff'),
        role: ORG_ROLES.CASHIER,
        isActive: true,
        sendInvite: true,
      });
      expect(res.status, res.text).toBe(201);
    });
  });

  describe('Cuotas IA (/api/ai/usage)', () => {
    it('sin ai_chat → límites 0', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: { panel: { enabled: true } },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      const res = await owner.client.get('/api/ai/usage');
      expect(res.status, res.text).toBe(200);
      expect((res.body.monthly ?? res.body.daily).limit).toBe(0);
    });

    it('refleja límites del plan y contadores de Postgres', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin);
      await createPlatformSubscription(admin, organization.id, plan.id);

      // Fetch periodStart del ciclo (subscription) para insertar en el período correcto
      const quotaBefore = await owner.client.get('/api/ai/usage');
      const periodStart = (quotaBefore.body as any).periodStart ?? new Date().toISOString().slice(0, 10);

      await testQuery(
        `INSERT INTO ai_usage (organization_id, period_type, period_start, credits, count)
         VALUES ($1, 'monthly', $2::date, 500, 0)
         ON CONFLICT (organization_id, period_type, period_start) DO UPDATE SET credits = 500`,
        [organization.id, periodStart],
      );

      const res = await owner.client.get('/api/ai/usage');
      expect(res.status, res.text).toBe(200);
      const monthly = (res.body as any).monthly ?? res.body.daily;
      expect(monthly.limit).toBe(1500);
      expect(monthly.used).toBe(500);
    });
  });

  describe('Snapshot de features en platform_subscription_payment', () => {
    it('almacena features del plan al crear la suscripción', async () => {
      const { owner, organization } = await createGymTenant();
      const plan = await createPlatformPlan(admin, {
        features: {
          panel: { enabled: true },
          cms: { enabled: true },
          ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
        },
      });
      await createPlatformSubscription(admin, organization.id, plan.id);

      const rows = await testQuery<{ features_snapshot: any }>(
        `SELECT features_snapshot FROM platform_subscription_payment
         WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [organization.id],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].features_snapshot.ai_chat.limits.ai_credits_monthly).toBe(1500);
      expect(rows[0].features_snapshot.cms.enabled).toBe(true);
    });
  });
});