import { ofetch } from "ofetch";

import type { CloudflareContext } from "../cloudflare";

/**
 * Server-side access to the Fit-Stack API Worker.
 *
 * Two transports, one contract:
 *
 * - **Deployed** (`dev`/`staging`/`production` Workers): the `API` service
 *   binding declared in `wrangler.jsonc`. No public hop, no cross-origin call.
 * - **`vite dev`**: `@cloudflare/vite-plugin` runs its own Miniflare instance
 *   and does NOT share the `wrangler dev` service registry, so the binding can
 *   be unreachable. `API_DEV_URL` (`.dev.vars`) opts into an explicit HTTP
 *   transport to a locally running api-worker.
 *
 * There is no silent fallback in either direction: a missing transport throws,
 * and `API_DEV_URL` is ignored outside dev so a deployed Worker can never talk
 * to a localhost API.
 */

/** Dev-only env var holding the origin of a locally running api-worker. */
export const API_DEV_URL_ENV = "API_DEV_URL";

/** Origin the API Worker sees for binding calls: it only cares about the path. */
const API_INTERNAL_ORIGIN = "https://api.internal";

/**
 * Headers forwarded from the browser request to the API Worker.
 *
 * `origin`/`referer` MUST travel: Better Auth validates state-changing requests
 * against `trustedOrigins` (the api-worker echoes an allowed `Origin`). Dropping
 * them would skip the check entirely, which matters because a deployed portal
 * runs with `sameSite=none` cookies. `host` is the one that must never be
 * forwarded: the API Worker must not believe it is serving the portal domain.
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "x-requested-with",
] as const;

/** Status codes that must not carry a body when a response is rebuilt. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** HTTP methods accepted by the helper. */
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestInit {
  readonly method?: ApiMethod;
  readonly headers?: Headers;
  /** JSON-serializable payload; serialized only for methods with a body. */
  readonly body?: unknown;
}

/** Payload handed to the dev HTTP transport (already serialized). */
interface DevTransportRequest {
  readonly method: string;
  readonly headers: Headers;
  readonly body?: BodyInit | null;
}

/** Raised when the API answers with a non-2xx status. */
export class ApiResponseError extends Error {
  readonly path: string;
  readonly status: number;

  constructor(path: string, status: number, statusText: string) {
    super(
      `API request to ${path} failed with ${status}${statusText ? ` ${statusText}` : ""}`,
    );
    this.name = "ApiResponseError";
    this.path = path;
    this.status = status;
  }
}

/**
 * Copies the headers a browser request must carry to the API. The session
 * cookie, credentials, content metadata and the origin travel; the public `Host`
 * of the portal never does.
 */
export function forwardRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

/**
 * Resolves the dev HTTP transport base URL, or `null` when the service binding
 * must be used.
 *
 * @throws Error when `API_DEV_URL` is set but blank: a misconfiguration must
 * fail visibly instead of silently degrading.
 */
export function resolveDevApiUrl(env: Env): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const raw = env.API_DEV_URL;
  if (raw === undefined) {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    throw new Error(
      `${API_DEV_URL_ENV} is set but empty. Remove it from .dev.vars or point it at the api-worker (e.g. http://localhost:8788).`,
    );
  }

  return value.replace(/\/+$/, "");
}

/** Returns the service binding or fails with an actionable message. */
function requireServiceBinding(env: Env): Fetcher {
  if (!env.API) {
    throw new Error(
      `The "API" service binding is not available. Locally, run the api-worker (pnpm --filter api-worker dev) and set ${API_DEV_URL_ENV} in apps/portal/.dev.vars; deployed environments resolve it from wrangler.jsonc.`,
    );
  }
  return env.API;
}

/**
 * Sends one request through the dev HTTP transport.
 *
 * `ofetch.raw` is used with `ignoreResponseError` and `arrayBuffer` so the
 * portal behaves as a real proxy: upstream status, `Set-Cookie` and binary
 * payloads (receipt PDFs) pass through untouched.
 */
async function requestDevApi(
  baseUrl: string,
  path: string,
  init: DevTransportRequest,
): Promise<Response> {
  const response = await ofetch.raw(`${baseUrl}${path}`, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    responseType: "arrayBuffer",
    ignoreResponseError: true,
    retry: 0,
  });

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  const body = NULL_BODY_STATUSES.has(response.status)
    ? null
    : (response._data ?? null);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Sends one request through whichever transport is configured. */
async function send(env: Env, path: string, init: ApiRequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && method !== "GET";
  const body = hasBody ? JSON.stringify(init.body) : null;

  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const devBaseUrl = resolveDevApiUrl(env);
  if (devBaseUrl) {
    return requestDevApi(devBaseUrl, path, { method, headers, body });
  }

  return requireServiceBinding(env).fetch(
    new Request(new URL(path, API_INTERNAL_ORIGIN), { method, headers, body }),
  );
}

/**
 * Proxy target for `/api/*`: the portal Worker forwards the browser request
 * as-is and returns the API response.
 */
export function proxyApiRequest(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;

  const devBaseUrl = resolveDevApiUrl(env);
  if (devBaseUrl) {
    return requestDevApi(devBaseUrl, path, {
      method: request.method,
      headers: forwardRequestHeaders(request),
      body: request.body,
    });
  }

  return requireServiceBinding(env).fetch(
    new Request(new URL(path, API_INTERNAL_ORIGIN), request),
  );
}

/**
 * Per-request API accessor for loaders and actions.
 *
 * @example
 * const api = createServerApi(context.get(cloudflareContext));
 * const health = healthSchema.parse(
 *   await api.json("/healthz", { headers: forwardRequestHeaders(request) }),
 * );
 */
export function createServerApi(runtime: CloudflareContext) {
  const { env } = runtime;

  return {
    /** Returns the raw upstream response (status included). */
    request(path: string, init?: ApiRequestInit): Promise<Response> {
      return send(env, path, init);
    },

    /**
     * Returns the parsed JSON body.
     *
     * @throws ApiResponseError on a non-2xx status, so a broken transport or an
     * authorization failure surfaces in the route error boundary.
     */
    async json(path: string, init?: ApiRequestInit): Promise<unknown> {
      const response = await send(env, path, init);
      if (!response.ok) {
        throw new ApiResponseError(path, response.status, response.statusText);
      }
      return response.json();
    },
  };
}
