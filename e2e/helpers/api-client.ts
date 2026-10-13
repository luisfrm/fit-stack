/**
 * E2E HTTP client with **resource tracking**.
 *
 * Every resource created from a test (`create(...)` or `track(...)`) is registered
 * and automatically deleted when the test ends, in reverse creation order
 * — that way the dependency between a plan and its subscription is respected. It
 * replaces the manual `afterAll` hooks that were forgotten and left garbage in
 * the development database.
 */
import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from './api';

/**
 * Delete endpoint per resource kind created from the tests.
 *
 * `null` = the resource is NOT deleted through the API. That is the case of
 * `subscription`: a financial record (subscription + payment) has no DELETE —
 * it is voided instead. Member (RD-120) and plan (RD-142) deletes are both
 * **soft deletes** (`deleted_at` + `restrict` FKs), so nothing cascades any
 * more: every per-test row stays inside `e2e-suite` until the tenant wipe
 * (global-setup/teardown), which is the real safety net. `cleanupDisposables`
 * stays best-effort: a failing delete warns `(se ignora)` and never fails a
 * test.
 */
const DELETE_ROUTES: Record<string, ((id: number | string) => string) | null> = {
  cmsBlock: (id) => `/api/cms/blocks/${id}`,
  cmsPage: (id) => `/api/cms/pages/${id}`,
  class: (id) => `/api/classes/${id}`,
  trainer: (id) => `/api/trainers/${id}`,
  subscription: null,
  member: (id) => `/api/members/${id}`,
  plan: (id) => `/api/plans/${id}`,
  platformOrg: (id) => `/api/platform/organizations/${id}`,
  platformPlan: (id) => `/api/platform/plans/${id}`,
  // Deletes the SaaS subscription; payments cascade by FK
  // (`subscription_id` → `platform_subscription.id` onDelete cascade).
  platformSubscription: (id) => `/api/platform/subscriptions/${id}`,
};

export type DisposableKind = keyof typeof DELETE_ROUTES;

export interface Disposable {
  kind: DisposableKind;
  id: number | string;
  label: string;
}

export interface ApiClient {
  context: APIRequestContext;
  get<T = any>(path: string, query?: Record<string, string | number | boolean>): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
  /** Registers an already created resource to delete it when the test ends. */
  track(kind: DisposableKind, id: number | string, label?: string): void;
  /** Creates and registers in one step: returns the JSON response. */
  create<T = any>(kind: DisposableKind, path: string, body: unknown, label?: string): Promise<T>;
}

export function createApiClient(context: APIRequestContext, disposables: Disposable[]): ApiClient {
  async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { body?: unknown; query?: Record<string, string | number | boolean> } = {},
  ): Promise<T> {
    const res = await context.fetch(path, {
      method,
      data: options.body,
      params: options.query,
      headers: { 'Content-Type': 'application/json', Origin: API_BASE_URL },
    });
    if (!res.ok()) {
      throw new Error(`${method} ${path} failed (${res.status()}): ${await res.text()}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    context,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    delete: (path) => request('DELETE', path),
    track(kind, id, label) {
      disposables.push({ kind, id, label: label ?? `${kind}#${id}` });
    },
    async create<T>(kind: DisposableKind, path: string, body: unknown, label?: string): Promise<T> {
      const created = await request<T>('POST', path, { body });
      const id = (created as { id?: number | string })?.id;
      if (id !== undefined) disposables.push({ kind, id, label: label ?? `${kind}#${id}` });
      return created;
    },
  };
}

/** Deletes what was created in reverse order (LIFO), best-effort: it never fails the suite. */
export async function cleanupDisposables(
  client: ApiClient,
  disposables: Disposable[],
): Promise<void> {
  for (const item of [...disposables].reverse()) {
    const route = DELETE_ROUTES[item.kind];
    if (!route) continue;
    try {
      await client.delete(route(item.id));
    } catch (err) {
      console.warn(`[e2e] no se pudo borrar ${item.label} (se ignora):`, err);
    }
  }
}

/** Creates an authenticated API context with the given `storageState`. */
export async function newAuthedApiContext(
  playwright: { request: { newContext: (options: any) => Promise<APIRequestContext> } },
  storageState: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: API_BASE_URL,
    storageState,
    extraHTTPHeaders: { Origin: API_BASE_URL },
  });
}
