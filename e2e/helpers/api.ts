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
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Origin': API_BASE_URL,
    ...extra,
  };
}

export function uid(prefix = ''): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Solo para fixtures desechables dentro de un test de la suite (nunca para el
 * tenant compartido, que usa identidades fijas en `test-tenant.ts`, ni para la
 * org de demo `fit-stack` del seed). Todo lo creado vive en la org de la suite
 * (`e2e-suite`), que el teardown global borra completa — además el fixture
 * `panelApi` lo borra al terminar cada test.
 */
export function uniqueEmail(label = 'user'): string {
  return `${label}-${uid()}@e2e.test`;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Cookie header value (e.g. the output of `signIn`). */
  cookies?: string;
  /** Query params appended to the path. */
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Raw request against the api-worker. Throws with status + body on failure. */
export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, cookies, query } = options;
  const res = await fetch(buildUrl(path, query), {
    method,
    headers: apiHeaders(cookies ? { cookie: cookies } : undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

/** Same as `apiRequest` but parses the JSON body. */
export async function apiJson<T = any>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const res = await apiRequest(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
  await apiJson('/api/auth/organization/set-active', {
    method: 'POST',
    cookies,
    body: { organizationId },
  });
}

export interface GymTenant {
  user: { userId: string; email: string; password: string };
  organization: TestOrganization;
  cookies: string;
}

/**
 * Crea un tenant de gimnasio desechable: usuario + organización + sesión.
 *
 * Utilidad genérica (hoy sin uso en los specs: la suite usa `e2e-suite` y los
 * vacíos usan `e2e-empty`, ambas del global-setup). Si se usa, la org creada
 * debe borrarse con `wipeTenant` en `afterAll`.
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
  return apiJson('/api/plans', {
    method: 'POST',
    cookies,
    body: {
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
    },
  });
}

/**
 * Creates a gym member via the API.
 */
export async function createGymMember(
  cookies: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  return apiJson('/api/members', {
    method: 'POST',
    cookies,
    body: {
      firstName: 'Ana',
      lastName: `Perez ${uid()}`,
      email: uniqueEmail('member'),
      role: 'member',
      isActive: true,
      sendInvite: false,
      ...overrides,
    },
  });
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
