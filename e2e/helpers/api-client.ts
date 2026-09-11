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

/** Endpoint de borrado por tipo de recurso creado desde los tests. */
const DELETE_ROUTES: Record<string, (id: number | string) => string> = {
  cmsBlock: (id) => `/api/cms/blocks/${id}`,
  cmsPage: (id) => `/api/cms/pages/${id}`,
  class: (id) => `/api/classes/${id}`,
  trainer: (id) => `/api/trainers/${id}`,
  subscription: (id) => `/api/subscriptions/${id}`,
  member: (id) => `/api/members/${id}`,
  plan: (id) => `/api/plans/${id}`,
  platformOrg: (id) => `/api/platform/organizations/${id}`,
  platformPlan: (id) => `/api/platform/plans/${id}`,
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
