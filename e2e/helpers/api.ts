/**
 * E2E test helpers — API-based fixture creation via HTTP.
 *
 * These helpers call the real api-worker through HTTP (not in-process like the
 * api-worker integration tests). This ensures E2E tests exercise the full stack
 * including CORS, cookies, and network latency.
 *
 * Environment variables:
 *   API_BASE_URL — api-worker URL (default: http://localhost:8788)
 */
import { randomUUID } from 'node:crypto';

export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8788';
export const TEST_PASSWORD = 'TestPassw0rd!E2E';

/** Default headers for all API calls — includes Origin for Better Auth. */
function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Origin': API_BASE_URL,
    ...extra,
  };
}

export function uid(prefix = ''): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function uniqueEmail(label = 'user'): string {
  return `${label}-${uid()}@e2e.test`;
}

export interface ApiUser {
  userId: string;
  email: string;
  password: string;
  token?: string;
}

/**
 * Registers a user via Better Auth sign-up endpoint.
 * Returns the user credentials for later login.
 */
export async function registerUser(
  overrides: { email?: string; name?: string; password?: string } = {},
): Promise<ApiUser> {
  const email = overrides.email ?? uniqueEmail();
  const name = overrides.name ?? `E2E User ${uid()}`;
  const password = overrides.password ?? TEST_PASSWORD;

  const res = await fetch(`${API_BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ email, name, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sign-up failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const userId = data?.user?.id;
  if (!userId) throw new Error(`sign-up returned no user id: ${JSON.stringify(data)}`);

  return { userId, email, password };
}

/**
 * Signs in an existing user and returns the session cookies.
 */
export async function signIn(userEmail: string, userPassword: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sign-in failed (${res.status}): ${text}`);
  }

  return extractCookiesFromResponse(res);
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

/**
 * Creates an organization via Better Auth's organization plugin.
 * Requires an authenticated session (cookies).
 */
export async function createOrganization(
  cookies: string,
  overrides: { name?: string; slug?: string; countryCode?: string } = {},
): Promise<TestOrganization> {
  const slug = overrides.slug ?? `gym-${uid()}`;
  const name = overrides.name ?? `Gym ${slug}`;
  const countryCode = overrides.countryCode ?? 'VE';

  const res = await fetch(`${API_BASE_URL}/api/auth/organization/create`, {
    method: 'POST',
    headers: apiHeaders({ cookie: cookies }),
    body: JSON.stringify({
      name,
      slug,
      countryCode,
      timezone: 'America/Caracas',
      primaryCurrency: 'VES',
      currencyFormat: 'latam',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`organization create failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const id = data?.id ?? data?.organization?.id;
  if (!id) throw new Error(`organization create returned no id: ${JSON.stringify(data)}`);

  return { id, name, slug };
}

/**
 * Sets the active organization on a session.
 */
export async function setActiveOrganization(
  cookies: string,
  organizationId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: apiHeaders({ cookie: cookies }),
    body: JSON.stringify({ organizationId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`set-active-organization failed (${res.status}): ${text}`);
  }
}

export interface GymTenant {
  user: { userId: string; email: string; password: string };
  organization: TestOrganization;
  cookies: string;
}

/**
 * Creates a complete gym tenant: user + organization + active session.
 * Returns credentials and cookies for API calls.
 */
export async function createGymTenant(label = 'owner'): Promise<GymTenant> {
  const user = await registerUser({ email: uniqueEmail(label) });
  const cookies = await signIn(user.email, user.password);
  const organization = await createOrganization(cookies);
  await setActiveOrganization(cookies, organization.id);
  return { user, organization, cookies };
}

/**
 * Creates a membership plan via the API.
 */
export async function createPlan(
  cookies: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/plans`, {
    method: 'POST',
    headers: apiHeaders({ cookie: cookies }),
    body: JSON.stringify({
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
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`create plan failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Creates a gym member via the API.
 */
export async function createGymMember(
  cookies: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/members`, {
    method: 'POST',
    headers: apiHeaders({ cookie: cookies }),
    body: JSON.stringify({
      firstName: 'Ana',
      lastName: `Perez ${uid()}`,
      email: uniqueEmail('member'),
      role: 'member',
      isActive: true,
      sendInvite: false,
      ...overrides,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`create member failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Extracts cookies from a native Response object (getSetCookie or fallback).
 */
function extractCookiesFromResponse(res: Response): string {
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter((v): v is string => Boolean(v));

  const cookieJar = new Map<string, string>();
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value && !/expires=Thu, 01 Jan 1970/i.test(raw)) {
      cookieJar.set(name, value);
    }
  }
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Extracts cookies from a Playwright response header (string).
 */
export function extractCookies(headers: Record<string, string>): string {
  const raw = headers['set-cookie'] ?? '';
  const cookieJar = new Map<string, string>();
  for (const part of raw.split(',')) {
    const [pair] = part.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
