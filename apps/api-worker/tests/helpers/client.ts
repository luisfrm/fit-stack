/**
 * Black-box HTTP client for the api-worker.
 *
 * Calls the real Hono app through `app.fetch(request, env, ctx)` — the exact
 * entry point Cloudflare uses in production — so every request goes through
 * CORS, the session middleware, the permission middleware, the route handler,
 * the service, the repository and finally Postgres.
 *
 * A cookie jar persists `Set-Cookie` values between calls, which is what makes
 * Better Auth sessions work across requests without ever reaching into
 * internals.
 */
import app from '../../src/index';
import { createTestEnv, type QueueSpy, type R2Spy } from './env';
import { trackPending } from './pending';

export const BASE_URL = 'http://localhost:8788';

export interface TestResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  /** Parsed JSON body, or `undefined` for empty/non-JSON responses. */
  body: T;
  /** Raw response text — always include this in assertion messages. */
  text: string;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** Send the request without the cookie jar (i.e. unauthenticated). */
  anonymous?: boolean;
}

/**
 * Under sustained load the shared Neon branch intermittently fails a session
 * lookup; Better Auth then reports "no session" and the permission middleware
 * answers 401 even though the cookie is valid. A 401 is emitted *before* any
 * route handler runs, so retrying an authenticated request is side-effect-free.
 *
 * We retry only this specific case: an authenticated, non-auth-endpoint request
 * that came back 401. Auth endpoints (a real 401 is expected there) and
 * anonymous requests are never retried, and no other status is ever retried —
 * so genuine 401/403 assertions keep their meaning.
 */
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_RETRY_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal execution context; `waitUntil` runs work inline so tests can await it. */
function createExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
        trackPending(promise);
      },
      passThroughOnException() {},
      props: {},
    },
    async settle() {
      // Drain in a loop: settling one batch can register further `waitUntil`
      // work. The iteration guard keeps a pathological producer from looping
      // forever (the global `drainAllPending` is the timeout-backed safety net).
      let guard = 0;
      while (pending.length > 0 && guard < 100) {
        guard += 1;
        const batch = pending.splice(0, pending.length);
        await Promise.allSettled(batch);
      }
    },
  };
}

export class TestClient {
  private readonly cookies = new Map<string, string>();
  readonly env: Record<string, unknown>;
  readonly queue: QueueSpy;
  /** Spy for fit-receipt-events (step 1, issue, re-enqueues). */
  readonly receiptQueue: QueueSpy;
  readonly r2: R2Spy;

  constructor() {
    const { env, queue, receiptQueue, r2 } = createTestEnv(BASE_URL);
    this.env = env;
    this.queue = queue;
    this.receiptQueue = receiptQueue;
    this.r2 = r2;
  }

  /** Current cookie header value, e.g. for passing to a second client. */
  get cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Replace this client's cookie jar (used to "switch user" in a test). */
  setCookieHeader(header: string): void {
    this.cookies.clear();
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name && rest.length > 0) this.cookies.set(name, rest.join('='));
    }
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private storeCookies(response: Response): void {
    // `getSetCookie` preserves every Set-Cookie header individually, which
    // matters because Better Auth may set several at once.
    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter((v): v is string => Boolean(v));

    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      if (!pair) continue;
      const separator = pair.indexOf('=');
      if (separator === -1) continue;

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();

      // Honour deletions so sign-out actually signs out.
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(cookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  private shouldRetryTransient(path: string, options: RequestOptions): boolean {
    return !options.anonymous && this.cookies.size > 0 && !path.startsWith('/api/auth/');
  }

  async request<T = any>(path: string, options: RequestOptions = {}): Promise<TestResponse<T>> {
    const maxAttempts = this.shouldRetryTransient(path, options) ? MAX_TRANSIENT_RETRIES + 1 : 1;

    let result: TestResponse<T> | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      result = await this.dispatch<T>(path, options);
      if (result.status !== 401 || attempt === maxAttempts - 1) break;
      await delay(TRANSIENT_RETRY_DELAY_MS * (attempt + 1));
    }
    return result as TestResponse<T>;
  }

  private async dispatch<T>(path: string, options: RequestOptions): Promise<TestResponse<T>> {
    const { method = 'GET', body, headers = {}, query, anonymous = false } = options;

    const url = new URL(path, BASE_URL);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const requestHeaders = new Headers({
      // Same-origin so Better Auth's trustedOrigins check passes.
      origin: BASE_URL,
      ...headers,
    });

    if (body !== undefined && !requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }

    if (!anonymous && this.cookies.size > 0) {
      requestHeaders.set('cookie', this.cookieHeader);
    }

    const request = new Request(url.toString(), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const { ctx, settle } = createExecutionContext();
    const response = await app.fetch(request, this.env as never, ctx as never);
    await settle();

    if (!anonymous) this.storeCookies(response);

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body: parsed as T,
      text,
    };
  }

  get<T = any>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = any>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T = any>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T = any>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T = any>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

/** Creates a fresh client with its own cookie jar and binding spies. */
export function createClient(): TestClient {
  return new TestClient();
}
