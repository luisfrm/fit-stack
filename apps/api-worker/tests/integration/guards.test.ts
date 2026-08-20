/**
 * Guard integration tests — the three route-handler middlewares:
 *
 *  1. `requireAuth`            → session + user (401 if missing)
 *  2. `requireOrgPermission`   → session + active org + org permission
 *                               (400 without org, 403 without permission)
 *  3. `requirePlatformPermission` / alias `requirePlatformAuth`
 *                               → session + platform permission
 *                               (401 / 403, roles: owner/admin allowed,
 *                                support is read-only, plain user denied)
 *
 * Fixtures are shared per `describe` (beforeAll) because the matrix tests
 * are all read-only or rejected before any mutation — this keeps the suite
 * fast while still hitting real HTTP → Better Auth → Neon.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  addUserToOrganization,
  createGymTenant,
  registerPlatformUser,
  registerUser,
  uid,
  uniqueEmail,
  type AuthedUser,
  type GymTenant,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Guards (route-handler middlewares)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('requireAuth', () => {
    let noOrgUser: AuthedUser;

    beforeAll(async () => {
      // A valid session with NO organization selected: the middleware must
      // let it through — only the route handler may complain afterwards.
      noOrgUser = await registerUser({ email: uniqueEmail('guards-auth') });
    });

    it('rejects requests without a session', async () => {
      const client = createClient();
      const res = await client.get('/api/organizations/subscription-status', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('lets a sessioned user without an organization through (handler-level 400)', async () => {
      const res = await noOrgUser.client.get('/api/organizations/subscription-status');

      // Not 401 — the middleware passed. The handler reports the missing org.
      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('allows any authenticated session regardless of role', async () => {
      const admin = await registerPlatformUser('admin');
      const res = await admin.client.get('/api/organizations/subscription-status');

      expect(res.status, res.text).toBe(200);
      expect(res.body.status).toBe('active');
    });

    it('does not require an active org or org permissions', async () => {
      const res = await noOrgUser.client.get('/api/upload', {
        query: { organizationId: `gym-${uid()}` },
      });

      // requireAuth passed with a bare session; the handler lists R2 (empty spy).
      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('requireOrgPermission', () => {
    let tenant: GymTenant;
    let manager: AuthedUser;
    let cashier: AuthedUser;
    let coach: AuthedUser;
    let member: AuthedUser;

    beforeAll(async () => {
      tenant = await createGymTenant('guards-org');
      manager = await addUserToOrganization(tenant.organization.id, ORG_ROLES.MANAGER, 'guards-manager');
      cashier = await addUserToOrganization(tenant.organization.id, ORG_ROLES.CASHIER, 'guards-cashier');
      coach = await addUserToOrganization(tenant.organization.id, ORG_ROLES.COACH, 'guards-coach');
      member = await addUserToOrganization(tenant.organization.id, ORG_ROLES.MEMBER, 'guards-member');
    });

    it('rejects requests without a session', async () => {
      const client = createClient();
      const res = await client.get('/api/settings', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects sessions without an active organization (400)', async () => {
      const user = await registerUser({ email: uniqueEmail('guards-noorg') });
      const res = await user.client.get('/api/settings');

      expect(res.status, res.text).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    // Positive matrix — every role allowed where the RBAC matrix says so.
    it('allows owner on SETTINGS.READ', async () => {
      const res = await tenant.owner.client.get('/api/settings');
      expect(res.status, res.text).toBe(200);
    });

    it('allows manager on SETTINGS.READ', async () => {
      const res = await manager.client.get('/api/settings');
      expect(res.status, res.text).toBe(200);
    });

    it('allows cashier on SETTINGS.READ', async () => {
      const res = await cashier.client.get('/api/settings');
      expect(res.status, res.text).toBe(200);
    });

    it('allows member on PLANS.READ', async () => {
      const res = await member.client.get('/api/plans');
      expect(res.status, res.text).toBe(200);
    });

    it('allows coach on CLASSES.READ', async () => {
      const res = await coach.client.get('/api/classes');
      expect(res.status, res.text).toBe(200);
    });

    // Negative matrix — denied where the RBAC matrix says so.
    it('rejects coach on SETTINGS.READ', async () => {
      const res = await coach.client.get('/api/settings');
      expect(res.status, res.text).toBe(403);
    });

    it('rejects member on SETTINGS.READ', async () => {
      const res = await member.client.get('/api/settings');
      expect(res.status, res.text).toBe(403);
    });

    it('rejects cashier on STAFF.READ (trainers)', async () => {
      const res = await cashier.client.get('/api/trainers');
      expect(res.status, res.text).toBe(403);
    });

    it('rejects coach on CLASSES.CREATE even with CLASSES.UPDATE', async () => {
      const res = await coach.client.post('/api/classes', { name: 'Nope' });
      expect(res.status, res.text).toBe(403);
    });

    it('rejects member on SUBSCRIPTIONS.CREATE', async () => {
      const res = await member.client.post('/api/subscriptions', {
        memberId: 1,
        planId: 1,
        payment: { amountPaid: 100, currencyPaid: 'USD', paymentMethod: 'cash' },
      });
      expect(res.status, res.text).toBe(403);
    });
  });

  describe('requirePlatformPermission (requirePlatformAuth alias)', () => {
    let admin: AuthedUser;
    let owner: AuthedUser;
    let support: AuthedUser;
    let plainUser: AuthedUser;

    beforeAll(async () => {
      admin = await registerPlatformUser('admin');
      owner = await registerPlatformUser('owner');
      support = await registerPlatformUser('support');
      plainUser = await registerUser({ email: uniqueEmail('guards-plain') });
    });

    it('rejects requests without a session', async () => {
      const client = createClient();
      const res = await client.get('/api/platform/settings', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('allows admin', async () => {
      const res = await admin.client.get('/api/platform/settings');
      expect(res.status, res.text).toBe(200);
    });

    it('allows owner', async () => {
      const res = await owner.client.get('/api/platform/settings');
      expect(res.status, res.text).toBe(200);
    });

    it('rejects a plain org-level user', async () => {
      const res = await plainUser.client.get('/api/platform/settings');
      expect(res.status, res.text).toBe(403);
    });

    it('rejects support (read-only) on routes guarded by organization.create', async () => {
      // GET /api/platform/settings is guarded by requirePlatformAuth, which
      // checks organization.create — support has setting.read but no org rights.
      const res = await support.client.get('/api/platform/settings');
      expect(res.status, res.text).toBe(403);
    });

    it('rejects support on POST /api/platform/organizations', async () => {
      const res = await support.client.post('/api/platform/organizations', {
        name: `Gym ${uid()}`,
        slug: `gym-${uid()}`,
      });
      expect(res.status, res.text).toBe(403);
    });

    it('rejects support on /api/platform/staff', async () => {
      const res = await support.client.get('/api/platform/staff');
      expect(res.status, res.text).toBe(403);
    });
  });
});