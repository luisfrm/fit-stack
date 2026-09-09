/**
 * Platform staff listing tests — GET /api/platform/staff filters:
 *
 * - no params → every user with a platform role (plain `user` excluded)
 * - `?role=` → narrows to one platform role (unknown role → 400)
 * - `?search=` → matches name or email, case-insensitive (ILIKE)
 * - both params combine
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import {
  assertSchemaReady,
  setUserPlatformRole,
  skipReason,
  truncateAll,
} from '../helpers/db';
import {
  registerPlatformUser,
  registerUser,
  uniqueEmail,
  type AuthedUser,
} from '../helpers/auth';

describe.skipIf(skipReason !== null)('Platform staff filters', () => {
  let admin: AuthedUser;
  let supportEmail: string;
  let namedEmail = '';

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    await registerPlatformUser('owner');
    const support = await registerPlatformUser('support');
    supportEmail = support.email;

    const named = await registerUser({
      name: 'Filtro ILIKE',
      email: uniqueEmail('platform-named'),
    });
    await setUserPlatformRole(named.userId, 'support');
    namedEmail = named.email;

    // Plain user — must never show up in the staff list.
    await registerUser({ email: uniqueEmail('platform-plain') });
  });

  it('returns all platform staff without filters', async () => {
    const res = await admin.client.get('/api/platform/staff');

    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveLength(4);
    for (const member of res.body) {
      expect(['owner', 'admin', 'support']).toContain(member.role);
    }
  });

  it('filters by role', async () => {
    const res = await admin.client.get('/api/platform/staff', {
      query: { role: 'support' },
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const member of res.body) {
      expect(member.role).toBe('support');
    }
    const emails = res.body.map((m: { email: string }) => m.email);
    expect(emails).toContain(supportEmail);
    expect(emails).toContain(namedEmail);
  });

  it('searches by email substring, case-insensitive', async () => {
    const res = await admin.client.get('/api/platform/staff', {
      query: { search: 'PLATFORM-SUPPORT' },
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const member of res.body) {
      expect(member.email.toLowerCase()).toContain('platform-support');
    }
  });

  it('searches by name', async () => {
    const res = await admin.client.get('/api/platform/staff', {
      query: { search: 'filtro ilike' },
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe(namedEmail);
  });

  it('combines role and search', async () => {
    const res = await admin.client.get('/api/platform/staff', {
      query: { role: 'admin', search: 'platform-' },
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].role).toBe('admin');
  });

  it('rejects an unknown role with 400', async () => {
    const res = await admin.client.get('/api/platform/staff', {
      query: { role: 'bogus' },
    });

    expect(res.status, res.text).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
