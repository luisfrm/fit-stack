/**
 * Cliente HTTP de los E2E con **tracking de recursos**.
 *
 * Cada recurso creado desde un test (`create(...)` o `track(...)`) se registra y
 * se borra automáticamente al terminar el test, en orden inverso al de creación
 * — así se respeta la dependencia entre un plan y su suscripción. Reemplaza los
 * `afterAll` manuales que se olvidaban y dejaban basura en la base de desarrollo.
 */
import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from './api';

/**
 * Delete endpoint per resource kind created from the tests.
 *
 * `null` = the resource is NOT deleted through the API. That is the case of
 * `subscription`: a financial record (subscription + payment) has no DELETE —
 * it is voided instead. Since RD-120 the member delete is a **soft delete** and
 * the FKs toward `gym_member` are `restrict`, so nothing cascades any more: the
 * plan that billed the subscription is not deletable either, and its disposable
 * is dropped in `dropReferencedPlanDisposable`. Per-test cleanup covers the
 * rest; the tenant wipe (global-setup/teardown) is the safety net.
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
  // Borra la suscripción SaaS; los pagos cascaddean por FK
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
  /** Registra un recurso ya creado para borrarlo al terminar el test. */
  track(kind: DisposableKind, id: number | string, label?: string): void;
  /** Crea y registra en un paso: devuelve la respuesta JSON. */
  create<T = any>(kind: DisposableKind, path: string, body: unknown, label?: string): Promise<T>;
}

/**
 * A subscription turns its plan into part of the immutable financial record:
 * the API refuses `DELETE /api/plans/:id` while a subscription references it
 * (FK `23503`), which is production-correct — the plan that billed someone is
 * never deleted. Since the subscription has no DELETE either, that disposable
 * can never succeed: it is dropped here instead of issuing a doomed request
 * that logged a scary stack after every test. The tenant wipe removes both rows
 * (`wipeTenant` deletes the org and cascades).
 */
function dropReferencedPlanDisposable(
  kind: DisposableKind,
  body: unknown,
  disposables: Disposable[],
): void {
  if (kind !== 'subscription') return;
  const planId = (body as { planId?: number | string } | null)?.planId;
  if (planId === undefined) return;
  const index = disposables.findIndex((item) => item.kind === 'plan' && item.id === planId);
  if (index >= 0) disposables.splice(index, 1);
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
      if (id !== undefined) {
        dropReferencedPlanDisposable(kind, body, disposables);
        disposables.push({ kind, id, label: label ?? `${kind}#${id}` });
      }
      return created;
    },
  };
}

/** Borra lo creado en orden inverso (LIFO), best-effort: nunca falla la suite. */
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

/** Crea un contexto de API autenticado con el `storageState` indicado. */
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
