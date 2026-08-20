/**
 * Platform (SaaS Admin) integration tests.
 *
 * Covers: /api/platform/settings, /api/platform/organizations — the
 * console-level admin routes that require a platform global role (admin/owner).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  registerPlatformUser,
  registerUser,
  uid,
  type AuthedUser,
} from '../helpers/auth';

describe.skipIf(skipReason !== null)('Platform API', () => {
  let admin: AuthedUser;
  let normalUser: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    // Shared fixtures: platform tests are read-only or create their own
    // resources, so one admin + one plain user serve the whole file.
    admin = await registerPlatformUser('admin');
    normalUser = await registerUser();
  });

  describe('GET /api/platform/settings', () => {
    it('returns platform settings for an admin user', async () => {
      const res = await admin.client.get('/api/platform/settings');

      expect(res.status, res.text).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('rejects unauthenticated requests', async () => {
      const client = createClient();
      const res = await client.get('/api/platform/settings', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects requests from org-level users without platform role', async () => {
      // normalUser has global role = "user" — no platform access
      const res = await normalUser.client.get('/api/platform/settings');

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('POST /api/platform/settings', () => {
    it('creates platform settings as admin', async () => {
      const res = await admin.client.post('/api/platform/settings', {
        platform_name: 'Fit-Stack',
      });

      expect(res.status, res.text).toBe(200);
    });

    it('rejects non-admin users', async () => {
      const res = await normalUser.client.post('/api/platform/settings', {
        platform_name: 'Hack',
      });

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('GET /api/platform/organizations', () => {
    it('returns paginated organizations for admin', async () => {
      const res = await admin.client.get('/api/platform/organizations');

      expect(res.status, res.text).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
    });

    it('rejects unauthenticated requests', async () => {
      const client = createClient();
      const res = await client.get('/api/platform/organizations', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });
  });

  describe('POST /api/platform/organizations', () => {
    it('creates an organization via platform admin', async () => {
      const res = await admin.client.post('/api/platform/organizations', {
        name: `Gym ${uid()}`,
        slug: `gym-${uid()}`,
        countryCode: 'VE',
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toContain('Gym');
    });

    it('rejects creation by non-admin', async () => {
      const res = await normalUser.client.post('/api/platform/organizations', {
        name: `Gym ${uid()}`,
      });

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('Organization provisioning flow', () => {
    it('admin can create org, fetch it, and update it', async () => {
      // Create
      const createRes = await admin.client.post('/api/platform/organizations', {
        name: `Provision Gym ${uid()}`,
        slug: `prov-${uid()}`,
      });
      expect(createRes.status, createRes.text).toBe(201);
      const orgId = createRes.body.id;

      // Fetch by id
      const getRes = await admin.client.get(`/api/platform/organizations/${orgId}`);
      expect(getRes.status, getRes.text).toBe(200);
      expect(getRes.body.id).toBe(orgId);

      // Update
      const updateRes = await admin.client.put(`/api/platform/organizations/${orgId}`, {
        name: 'Updated Gym Name',
      });
      expect(updateRes.status, updateRes.text).toBe(200);
      expect(updateRes.body.name).toBe('Updated Gym Name');
    });

    it('admin can delete an organization', async () => {
      const createRes = await admin.client.post('/api/platform/organizations', {
        name: `Delete Me ${uid()}`,
        slug: `del-${uid()}`,
      });
      const orgId = createRes.body.id;

      const delRes = await admin.client.delete(`/api/platform/organizations/${orgId}`);
      expect(delRes.status, delRes.text).toBe(200);

      // Verify gone — API returns 404 with error envelope (not found)
      const getRes = await admin.client.get(`/api/platform/organizations/${orgId}`);
      expect(getRes.status, getRes.text).toBe(404);
      expect(getRes.body).toHaveProperty('error');
    });
  });
});
