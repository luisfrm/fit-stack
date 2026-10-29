/**
 * Members integration tests.
 *
 * Covers: full CRUD lifecycle for gym members + permission enforcement.
 * Gym members are the local profiles (gym_member table) linked to users.
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
  uniqueEmail,
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
      status: 'validated',
      paymentDate: isoDate(0),
    },
  });
  if (res.status !== 201) throw new Error(`create subscription failed: ${res.text}`);
  return res.body;
}

describe.skipIf(skipReason !== null)('Members API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('POST /api/members', () => {
    let tenant: GymTenant;

    beforeAll(async () => {
      // Shared tenant: these tests create members with unique emails or fail
      // validation before any mutation, so one org serves them all.
      tenant = await createGymTenant('members-post');
    });

    it('creates a gym member with required fields', async () => {
      const member = await createGymMember(tenant.owner.client);

      expect(member).toHaveProperty('id');
      expect(member.id).toBeGreaterThan(0);
      expect(member.firstName).toBe('Ana');
      expect(member.email).toContain('@fitstack.test');
    });

    it('creates a member with explicit role', async () => {
      const member = await createGymMember(tenant.owner.client, {
        firstName: 'Coach',
        lastName: 'Test',
        role: ORG_ROLES.COACH,
      });

      expect(member.role).toBe(ORG_ROLES.COACH);
    });

    it('rejects creation with missing firstName', async () => {
      const res = await tenant.owner.client.post('/api/members', {
        lastName: 'Perez',
        email: uniqueEmail(),
        role: 'member',
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects creation with invalid email', async () => {
      const res = await tenant.owner.client.post('/api/members', {
        firstName: 'Test',
        lastName: 'User',
        email: 'not-an-email',
        role: 'member',
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects a document type from another country (400 DOCUMENT_TYPE_INVALID)', async () => {
      // The tenant is created in VE, so `C.C.` (a CO prefix) is out of its
      // catalog: the server must reject it, not only the UI (RD-148).
      const res = await tenant.owner.client.post('/api/members', {
        firstName: 'Test',
        lastName: 'Doc Bad',
        email: uniqueEmail(),
        role: 'member',
        documentId: 'C.C.-12345678',
      });

      expect(res.status, res.text).toBe(400);
      expect(res.body).toMatchObject({
        code: 'DOCUMENT_TYPE_INVALID',
        fields: ['documentId'],
      });
    });

    it('accepts a document type of the organization country', async () => {
      const res = await tenant.owner.client.post('/api/members', {
        firstName: 'Test',
        lastName: 'Doc Ok',
        email: uniqueEmail(),
        role: 'member',
        documentId: 'V-12345678',
      });

      expect(res.status, res.text).toBe(201);
    });

    it('rejects unauthenticated creation', async () => {
      const client = createClient();
      const res = await client.post('/api/members', {
        firstName: 'Test',
        lastName: 'User',
        email: uniqueEmail(),
        role: 'member',
      }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    // Anti-escalation: the invited/created role comes from the body, so the
    // server (never the client) must bound it by the actor's own role.
    it('rejects a role the actor cannot assign', async () => {
      const manager = await addUserToOrganization(
        tenant.organization.id,
        ORG_ROLES.MANAGER,
        'mem-role-manager',
      );

      const res = await manager.client.post('/api/members', {
        firstName: 'Escalated',
        lastName: 'Owner',
        email: uniqueEmail('escalated-owner'),
        role: ORG_ROLES.OWNER,
      });

      expect(res.status, res.text).toBe(403);
      expect(res.body).toMatchObject({ code: 'ROLE_ASSIGNMENT_NOT_ALLOWED' });
    });

    it('lets a cashier create only member-role rows', async () => {
      const cashier = await addUserToOrganization(
        tenant.organization.id,
        ORG_ROLES.CASHIER,
        'mem-role-cashier',
      );

      const forbidden = await cashier.client.post('/api/members', {
        firstName: 'Not',
        lastName: 'Manager',
        email: uniqueEmail('cashier-manager'),
        role: ORG_ROLES.MANAGER,
      });
      expect(forbidden.status, forbidden.text).toBe(403);
      expect(forbidden.body).toMatchObject({ code: 'ROLE_ASSIGNMENT_NOT_ALLOWED' });

      const allowed = await cashier.client.post('/api/members', {
        firstName: 'Gym',
        lastName: 'Client',
        email: uniqueEmail('cashier-member'),
        role: ORG_ROLES.MEMBER,
      });
      expect(allowed.status, allowed.text).toBe(201);
    });

    it('rejects creation by member without MEMBERS.CREATE', async () => {
      const { organization } = await createGymTenant();
      const member = await addUserToOrganization(organization.id, ORG_ROLES.MEMBER, 'mem-create-member');
      const res = await member.client.post('/api/members', {
        firstName: 'Test',
        lastName: 'User',
        email: uniqueEmail(),
        role: 'member',
      });

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('GET /api/members', () => {
    it('returns paginated members', async () => {
      const { owner } = await createGymTenant();
      await createGymMember(owner.client, { firstName: 'First' });
      await createGymMember(owner.client, { firstName: 'Second' });

      const res = await owner.client.get('/api/members', { query: { page: '1', limit: '10' } });
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('totalPages');
    });

    it('filters members by search query', async () => {
      const { owner } = await createGymTenant();
      const unique = `Searchable${uid()}`;
      await createGymMember(owner.client, { firstName: unique, lastName: 'Test' });
      await createGymMember(owner.client, { firstName: 'Other', lastName: 'Person' });

      const res = await owner.client.get('/api/members', { query: { query: unique } });
      expect(res.status, res.text).toBe(200);

      const names = res.body.data.map((m: any) => `${m.firstName} ${m.lastName}`);
      expect(names.some((n: string) => n.includes(unique))).toBe(true);
    });

    it('returns a specific member by id', async () => {
      const { owner } = await createGymTenant();
      const created = await createGymMember(owner.client, { firstName: 'FindMe' });

      const res = await owner.client.get(`/api/members/${created.id}`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.firstName).toBe('FindMe');
    });
  });

  describe('PUT /api/members/:id', () => {
    it('updates member firstName', async () => {
      const { owner } = await createGymTenant();
      const member = await createGymMember(owner.client, { firstName: 'OldName' });

      const res = await owner.client.put(`/api/members/${member.id}`, {
        firstName: 'NewName',
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.firstName).toBe('NewName');
    });

    it('updates member isActive status', async () => {
      const { owner } = await createGymTenant();
      const member = await createGymMember(owner.client, { isActive: true });

      const res = await owner.client.put(`/api/members/${member.id}`, {
        isActive: false,
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('DELETE /api/members/:id', () => {
    it('soft-deletes a member: row persists, hidden from GET and listing', async () => {
      const { owner } = await createGymTenant('del-soft');
      const member = await createGymMember(owner.client, { firstName: 'SoftDel' });

      const del = await owner.client.delete(`/api/members/${member.id}`);
      expect(del.status, del.text).toBe(200);
      expect(del.body).toEqual({ success: true });

      // GET /:id returns 404 for a soft-deleted member.
      const get = await owner.client.get(`/api/members/${member.id}`);
      expect(get.status, get.text).toBe(404);

      // The row still exists; only `deleted_at` is set.
      const rows = await testQuery<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM gym_member WHERE id = $1`,
        [member.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deleted_at).not.toBeNull();

      // Absent from the listing.
      const list = await owner.client.get('/api/members', { query: { limit: '50' } });
      expect(list.status, list.text).toBe(200);
      expect(list.body.data.map((m: { id: number }) => m.id)).not.toContain(member.id);
    });

    it('is idempotent: re-deleting an already-deleted member returns 200', async () => {
      const { owner } = await createGymTenant('del-idem');
      const member = await createGymMember(owner.client, { firstName: 'Idem' });

      const first = await owner.client.delete(`/api/members/${member.id}`);
      expect(first.status, first.text).toBe(200);
      const second = await owner.client.delete(`/api/members/${member.id}`);
      expect(second.status, second.text).toBe(200);
      expect(second.body).toEqual({ success: true });
    });

    it('returns 404 when the member does not exist', async () => {
      const { owner } = await createGymTenant('del-missing');
      const res = await owner.client.delete('/api/members/999999999');
      expect(res.status, res.text).toBe(404);
    });

    it('preserves payments and subscriptions, revokes auth access', async () => {
      const tenant = await createGymTenant('del-history');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan SoftDelete' });
      const member = await createGymMember(tenant.owner.client, { firstName: 'ConHistorial' });
      await createSubscription(tenant, member.id, plan.id, 30);

      // Simulate a linked account so `auth_member` exists to be revoked.
      const linked = await addUserToOrganization(
        tenant.organization.id,
        ORG_ROLES.MEMBER,
        'del-history-linked',
      );
      await testQuery(`UPDATE "gym_member" SET "user_id" = $1 WHERE "id" = $2`, [
        linked.userId,
        member.id,
      ]);
      const before = await testQuery<{ id: string }>(
        `SELECT id FROM "member" WHERE organization_id = $1 AND user_id = $2`,
        [tenant.organization.id, linked.userId],
      );
      expect(before).toHaveLength(1);

      const del = await tenant.owner.client.delete(`/api/members/${member.id}`);
      expect(del.status, del.text).toBe(200);

      // Financial history is intact.
      const subs = await testQuery(`SELECT id FROM subscription WHERE member_id = $1`, [member.id]);
      const pays = await testQuery(`SELECT id FROM payment WHERE member_id = $1`, [member.id]);
      expect(subs).toHaveLength(1);
      expect(pays).toHaveLength(1);

      // Portal access revoked (per-member auth membership removed).
      const after = await testQuery<{ id: string }>(
        `SELECT id FROM "member" WHERE organization_id = $1 AND user_id = $2`,
        [tenant.organization.id, linked.userId],
      );
      expect(after).toHaveLength(0);

      // Still hidden from the listing.
      const list = await tenant.owner.client.get('/api/members', { query: { limit: '50' } });
      expect(list.body.data.map((m: { id: number }) => m.id)).not.toContain(member.id);
    });

    it('keeps an inactive (not deleted) member visible with its badge state', async () => {
      const { owner } = await createGymTenant('del-inactive');
      const member = await createGymMember(owner.client, { firstName: 'Inactivo', isActive: false });

      const get = await owner.client.get(`/api/members/${member.id}`);
      expect(get.status, get.text).toBe(200);
      expect(get.body.isActive).toBe(false);

      const list = await owner.client.get('/api/members', { query: { limit: '50' } });
      expect(list.body.data.map((m: { id: number }) => m.id)).toContain(member.id);
    });

    it('database rejects a direct hard delete of a member with history (restrict)', async () => {
      const tenant = await createGymTenant('del-restrict');
      const plan = await createPlan(tenant.owner.client, { name: 'Plan Restrict' });
      const member = await createGymMember(tenant.owner.client, { firstName: 'ConFK' });
      await createSubscription(tenant, member.id, plan.id, 30);

      await expect(
        testQuery(`DELETE FROM gym_member WHERE id = $1`, [member.id]),
      ).rejects.toThrow();
    });

    it('rejects delete by member without MEMBERS.DELETE', async () => {
      const { organization } = await createGymTenant();
      const manager = await addUserToOrganization(organization.id, ORG_ROLES.MANAGER, 'mem-del-mgr');
      const member = await createGymMember(manager.client);

      // Manager cannot delete (no MEMBERS.DELETE in RBAC)
      const res = await manager.client.delete(`/api/members/${member.id}`);
      expect(res.status, res.text).toBe(403);
    });
  });

  describe('Organization isolation', () => {
    it('org A cannot see org B members', async () => {
      const tenant1 = await createGymTenant('mem-iso-a');
      const tenant2 = await createGymTenant('mem-iso-b');

      await createGymMember(tenant1.owner.client, { firstName: 'MemberA' });
      await createGymMember(tenant2.owner.client, { firstName: 'MemberB' });

      const res1 = await tenant1.owner.client.get('/api/members');
      const res2 = await tenant2.owner.client.get('/api/members');

      const names1 = res1.body.data.map((m: any) => m.firstName);
      const names2 = res2.body.data.map((m: any) => m.firstName);

      expect(names1).toContain('MemberA');
      expect(names1).not.toContain('MemberB');
      expect(names2).toContain('MemberB');
      expect(names2).not.toContain('MemberA');
    });
  });
});
