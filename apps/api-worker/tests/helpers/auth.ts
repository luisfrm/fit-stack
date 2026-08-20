/**
 * Auth + fixture helpers — the equivalent of `helpers.py` in the pytest suite.
 *
 * Everything goes through real HTTP endpoints wherever an endpoint exists.
 * Direct SQL is used only for things the API deliberately has no route for
 * (promoting a user to a platform role), mirroring the pytest
 * approach of flipping `is_superuser` in the DB.
 */
import { randomUUID } from 'node:crypto';
import { createClient, type TestClient } from './client';
import { setUserPlatformRole, testQuery } from './db';
import { ORG_ROLES } from '@workspace/shared';

/** Short unique suffix so records never collide across runs. */
export function uid(prefix = ''): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function uniqueEmail(label = 'user'): string {
  return `${label}-${uid()}@fitstack.test`;
}

export const TEST_PASSWORD = 'TestPassw0rd!2026';

export interface AuthedUser {
  client: TestClient;
  userId: string;
  email: string;
  name: string;
}

/**
 * Signs up a new user through Better Auth and returns a client whose cookie jar
 * already holds the session.
 */
export async function registerUser(
  options: { email?: string; name?: string; password?: string; client?: TestClient } = {},
): Promise<AuthedUser> {
  const client = options.client ?? createClient();
  const email = options.email ?? uniqueEmail();
  const name = options.name ?? `Test User ${uid()}`;
  const password = options.password ?? TEST_PASSWORD;

  const res = await client.post('/api/auth/sign-up/email', { email, name, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`sign-up failed (${res.status}): ${res.text}`);
  }

  const userId = res.body?.user?.id;
  if (!userId) throw new Error(`sign-up returned no user id: ${res.text}`);

  // Some Better Auth configurations do not return a session cookie on sign-up.
  if (!client.cookieHeader.length) {
    await signIn(client, email, password);
  }

  return { client, userId, email, name };
}

/** Signs an existing user in, populating the client's cookie jar. */
export async function signIn(
  client: TestClient,
  email: string,
  password = TEST_PASSWORD,
): Promise<void> {
  const res = await client.post('/api/auth/sign-in/email', { email, password });
  if (res.status !== 200) {
    throw new Error(`sign-in failed (${res.status}): ${res.text}`);
  }
}

/**
 * Registers a user and promotes them to a platform role
 * (`admin` / `owner` / `support`). Role changes are applied straight to the DB
 * because there is intentionally no public endpoint for self-promotion.
 */
export async function registerPlatformUser(
  role: 'admin' | 'owner' | 'support' = 'admin',
): Promise<AuthedUser> {
  const user = await registerUser({ email: uniqueEmail(`platform-${role}`) });
  await setUserPlatformRole(user.userId, role);
  // Re-issue the session so the custom session picks up the new platform role.
  await signIn(user.client, user.email);
  return user;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

/** Creates an organization via the Better Auth organization plugin. */
export async function createOrganization(
  client: TestClient,
  overrides: { name?: string; slug?: string } = {},
): Promise<TestOrganization> {
  const slug = overrides.slug ?? `gym-${uid()}`;
  const name = overrides.name ?? `Gym ${slug}`;

  const res = await client.post('/api/auth/organization/create', { name, slug });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`organization create failed (${res.status}): ${res.text}`);
  }

  const id = res.body?.id ?? res.body?.organization?.id;
  if (!id) throw new Error(`organization create returned no id: ${res.text}`);

  return { id, name, slug };
}

/** Sets the active organization on the current session. */
export async function setActiveOrganization(
  client: TestClient,
  organizationId: string,
): Promise<void> {
  const res = await client.post('/api/auth/organization/set-active', { organizationId });
  if (res.status !== 200) {
    throw new Error(`set-active-organization failed (${res.status}): ${res.text}`);
  }
}

export interface GymTenant {
  /** Client authenticated as the organization OWNER with the org active. */
  owner: AuthedUser;
  organization: TestOrganization;
}

/**
 * The workhorse fixture: a signed-in user who owns a brand new organization
 * with that organization already active on the session.
 */
export async function createGymTenant(label = 'owner'): Promise<GymTenant> {
  const owner = await registerUser({ email: uniqueEmail(label) });
  const organization = await createOrganization(owner.client);
  await setActiveOrganization(owner.client, organization.id);
  return { owner, organization };
}

/**
 * Adds a second user to an existing organization with the given role and
 * returns a client authenticated as them with the org active.
 *
 * Uses direct inserts into `member` because the invitation flow requires an
 * email round-trip; the goal here is to test *authorization*, not invitations
 * (those are covered separately by asserting the queued events).
 */
export async function addUserToOrganization(
  organizationId: string,
  role: string,
  label = role,
): Promise<AuthedUser> {
  const user = await registerUser({ email: uniqueEmail(label) });

  await testQuery(
    `INSERT INTO "member" (id, organization_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [randomUUID(), organizationId, user.userId, role],
  );

  await setActiveOrganization(user.client, organizationId);
  return user;
}

/** Creates a membership plan through the API and returns it. */
export async function createPlan(
  client: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await client.post('/api/plans', {
    name: `Plan ${uid()}`,
    price: 50,
    currency: 'USD',
    durationValue: 1,
    durationUnit: 'month',
    features: ['Acceso completo'],
    isPopular: false,
    isActive: true,
    isVisibleOnSite: true,
    ...overrides,
  });

  if (res.status !== 201) throw new Error(`create plan failed (${res.status}): ${res.text}`);
  return res.body;
}

/** Creates a gym member (client) through the API and returns it. */
export async function createGymMember(
  client: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await client.post('/api/members', {
    firstName: 'Ana',
    lastName: `Perez ${uid()}`,
    email: uniqueEmail('member'),
    role: ORG_ROLES.MEMBER,
    isActive: true,
    sendInvite: false,
    ...overrides,
  });

  if (res.status !== 201) throw new Error(`create member failed (${res.status}): ${res.text}`);
  return res.body;
}

/** ISO `YYYY-MM-DD` helper for building subscription windows. */
export function isoDate(offsetDays = 0, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
