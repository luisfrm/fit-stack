/**
 * Members integration tests.
 *
 * Covers: full CRUD lifecycle for gym members + permission enforcement.
 * Gym members are the local profiles (gym_member table) linked to users.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  createGymMember,
  uniqueEmail,
  uid,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Members API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('POST /api/members', () => {
    it('creates a gym member with required fields', async () => {
      const { owner } = await createGymTenant();
      const member = await createGymMember(owner.client);

      expect(member).toHaveProperty('id');
      expect(member.id).toBeGreaterThan(0);
      expect(member.firstName).toBe('Ana');
      expect(member.email).toContain('@fitstack.test');
    });

    it('creates a member with explicit role', async () => {
      const { owner } = await createGymTenant();
      const member = await createGymMember(owner.client, {
        firstName: 'Coach',
        lastName: 'Test',
        role: ORG_ROLES.COACH,
      });

      expect(member.role).toBe(ORG_ROLES.COACH);
    });

    it('rejects creation with missing firstName', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/members', {
        lastName: 'Perez',
        email: uniqueEmail(),
        role: 'member',
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects creation with invalid email', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/members', {
        firstName: 'Test',
        lastName: 'User',
        email: 'not-an-email',
        role: 'member',
      });

      expect(res.status, res.text).toBe(400);
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
    it('deletes a member as owner', async () => {
      const { owner } = await createGymTenant();
      const member = await createGymMember(owner.client);

      const del = await owner.client.delete(`/api/members/${member.id}`);
      expect(del.status, del.text).toBe(200);

      // Verify gone — GET /:id returns 404 for deleted member
      const get = await owner.client.get(`/api/members/${member.id}`);
      expect(get.status, get.text).toBe(404);
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
