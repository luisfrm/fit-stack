/**
 * Platform init tests — the very first user bootstraps the SaaS:
 *
 * 1. `POST /api/init` on an empty database creates the user with the `owner`
 *    platform role (the "Administrador Maestro" — the only role that can
 *    later assign other owners, since `admin` can only assign support/admin).
 * 2. Platform settings are seeded so console never hits silent fallbacks.
 * 3. A second init is rejected once users exist.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';

describe.skipIf(skipReason !== null)('Platform init (first owner)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  it('creates the first user with the owner platform role and seeds settings', async () => {
    const client = createClient();
    const res = await client.post('/api/init', {
      name: 'Init Owner',
      email: 'init-owner@test.local',
      password: 'TestPassw0rd!Init',
    });

    expect(res.status, res.text).toBe(201);
    expect(res.body).toMatchObject({ email: 'init-owner@test.local', role: 'owner' });

    const rows = await testQuery<{ role: string }>(
      `SELECT role FROM "user" WHERE email = $1`,
      ['init-owner@test.local'],
    );
    expect(rows[0]?.role).toBe('owner');

    const settings = await testQuery<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM platform_setting`,
    );
    expect(Number(settings[0]?.total ?? 0)).toBeGreaterThan(0);
  });

  it('rejects a second initialization once users exist', async () => {
    const client = createClient();

    const statusRes = await client.get('/api/init');
    expect(statusRes.status, statusRes.text).toBe(200);
    expect(statusRes.body).toMatchObject({ needsInit: false });

    const res = await client.post('/api/init', {
      name: 'Second Owner',
      email: 'init-second@test.local',
      password: 'TestPassw0rd!Init',
    });
    expect(res.status, res.text).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
