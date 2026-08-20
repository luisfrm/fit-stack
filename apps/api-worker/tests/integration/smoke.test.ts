/**
 * Harness smoke test.
 *
 * Validates the plumbing the whole integration suite depends on: the app boots
 * through `app.fetch`, the test DB is reachable and migrated, Better Auth
 * issues a session cookie that survives across requests, and an org-scoped
 * route resolves the active organization from that session.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import { createGymTenant } from '../helpers/auth';

describe.skipIf(skipReason !== null)('harness smoke', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  it('serves the public healthcheck without auth or DB', async () => {
    const client = createClient();
    const res = await client.get('/healthz', { anonymous: true });

    expect(res.status, res.text).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('signs a user up and keeps the session across requests', async () => {
    const { owner, organization } = await createGymTenant();

    const session = await owner.client.get('/api/auth/get-session');
    expect(session.status, session.text).toBe(200);
    expect(session.body?.user?.id).toBe(owner.userId);
    expect(session.body?.session?.activeOrganizationId).toBe(organization.id);
  });

  it('resolves the active organization on an org-scoped route', async () => {
    const { owner } = await createGymTenant();

    const res = await owner.client.get('/api/settings');
    expect(res.status, res.text).toBe(200);
    expect(res.body).toEqual({});
  });

  it('rejects org-scoped routes without a session', async () => {
    const client = createClient();
    const res = await client.get('/api/settings', { anonymous: true });

    expect(res.status, res.text).toBe(401);
  });
});
