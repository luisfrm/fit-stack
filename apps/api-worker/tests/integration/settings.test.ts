/**
 * Settings integration tests.
 *
 * Covers: GET /api/settings, GET /api/settings/:key, POST /api/settings
 * Validates: full CRUD, partial updates, cache invalidation, auth enforcement,
 * and that POST returns the complete settings object (not just a success flag).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  type GymTenant,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Settings API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  describe('GET /api/settings', () => {
    let tenant: GymTenant;

    beforeAll(async () => {
      // Shared tenant: the GET tests are read-only, so one org serves them all.
      tenant = await createGymTenant('settings-get');
    });

    it('returns empty object for a new organization', async () => {
      const res = await tenant.owner.client.get('/api/settings');

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({});
    });

    it('rejects unauthenticated requests', async () => {
      const client = createClient();
      const res = await client.get('/api/settings', { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects requests from a member without SETTINGS.READ permission', async () => {
      const member = await addUserToOrganization(tenant.organization.id, ORG_ROLES.MEMBER, 'settings-member');
      const res = await member.client.get('/api/settings');

      expect(res.status, res.text).toBe(403);
    });
  });

  describe('GET /api/settings/:key', () => {
    it('returns null value for a non-existent key', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.get('/api/settings/brand_primary');

      expect(res.status, res.text).toBe(200);
      expect(res.body.key).toBe('brand_primary');
      expect(res.body.value).toBeNull();
    });
  });

  describe('POST /api/settings', () => {
    it('creates settings and returns the full settings object', async () => {
      const { owner } = await createGymTenant();

      const res = await owner.client.post('/api/settings', {
        brand_primary: '#FF0000',
        currency_format: 'latam',
      });

      expect(res.status, res.text).toBe(200);
      // POST should return the full settings object, not { success: true }
      expect(res.body.brand_primary).toBe('#FF0000');
      expect(res.body.currency_format).toBe('latam');
    });

    it('preserves existing settings when updating a subset', async () => {
      const { owner } = await createGymTenant();

      // First save
      await owner.client.post('/api/settings', {
        brand_primary: '#FF0000',
        active_currencies: '["USD","VES"]',
      });

      // Second save — only updates brand_primary
      const res = await owner.client.post('/api/settings', {
        brand_primary: '#00FF00',
      });

      expect(res.status, res.text).toBe(200);
      // The response must include ALL settings, not just the patch
      expect(res.body.brand_primary).toBe('#00FF00');
      expect(res.body.active_currencies).toBe('["USD","VES"]');
    });

    it('overwrites an existing setting value', async () => {
      const { owner } = await createGymTenant();

      await owner.client.post('/api/settings', { brand_primary: '#111111' });
      const res = await owner.client.post('/api/settings', { brand_primary: '#222222' });

      expect(res.status, res.text).toBe(200);
      expect(res.body.brand_primary).toBe('#222222');
    });

    it('GET returns the persisted values after POST', async () => {
      const { owner } = await createGymTenant();

      await owner.client.post('/api/settings', {
        brand_primary: '#ABCDEF',
        currency_format: 'usa',
      });

      const get = await owner.client.get('/api/settings');
      expect(get.status, get.text).toBe(200);
      expect(get.body.brand_primary).toBe('#ABCDEF');
      expect(get.body.currency_format).toBe('usa');
    });

    it('rejects unauthenticated POST', async () => {
      const client = createClient();
      const res = await client.post('/api/settings', { brand_primary: '#000' }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('rejects POST from a member without SETTINGS.UPDATE permission', async () => {
      const { organization } = await createGymTenant();
      const cashier = await addUserToOrganization(organization.id, ORG_ROLES.CASHIER, 'settings-cashier');
      const res = await cashier.client.post('/api/settings', { brand_primary: '#000' });

      // Cashier has SETTINGS.READ but not UPDATE
      expect(res.status, res.text).toBe(403);
    });

    it('accepts empty object without error', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/settings', {});

      expect(res.status, res.text).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  describe('Settings isolation', () => {
    it('organizations do not share settings', async () => {
      const tenant1 = await createGymTenant('org1');
      const tenant2 = await createGymTenant('org2');

      await tenant1.owner.client.post('/api/settings', { brand_primary: '#AAAAAA' });
      await tenant2.owner.client.post('/api/settings', { brand_primary: '#BBBBBB' });

      const res1 = await tenant1.owner.client.get('/api/settings');
      const res2 = await tenant2.owner.client.get('/api/settings');

      expect(res1.body.brand_primary).toBe('#AAAAAA');
      expect(res2.body.brand_primary).toBe('#BBBBBB');
    });
  });
});
