/**
 * Builds the Worker `Env` (bindings) object used by tests.
 *
 * Real dependencies: Postgres (Neon test branch) and Better Auth — these are
 * exercised for real, because that is where the bugs live.
 *
 * Faked dependencies: only the Cloudflare *bindings* that have no local
 * equivalent (R2, Queues). They are recording spies, so tests can assert on
 * the side effects the API is contractually required to produce — e.g. that
 * registering a payment enqueues `email.payment_receipt`.
 *
 * Redis is intentionally left unconfigured: `createCache` degrades to a no-op,
 * which keeps tests deterministic (no cross-test cache bleed) while still
 * exercising every cache code path.
 */
import { TEST_DATABASE_URL } from './db';

export interface QueuedMessage {
  type: string;
  [key: string]: unknown;
}

export interface QueueSpy {
  messages: QueuedMessage[];
  /** All messages of a given event type. */
  ofType(type: string): QueuedMessage[];
  reset(): void;
}

export interface R2Spy {
  objects: Map<string, { body: string; contentType?: string }>;
  reset(): void;
}

export interface TestEnv {
  env: Record<string, unknown>;
  queue: QueueSpy;
  r2: R2Spy;
}

function createQueueSpy() {
  const messages: QueuedMessage[] = [];

  const binding = {
    async send(message: QueuedMessage) {
      // Structured-clone to mimic the real queue boundary: handlers must not
      // be able to observe live object references from the producer.
      messages.push(JSON.parse(JSON.stringify(message)));
    },
    async sendBatch(batch: Array<{ body: QueuedMessage }>) {
      for (const item of batch) {
        messages.push(JSON.parse(JSON.stringify(item.body)));
      }
    },
  };

  const spy: QueueSpy = {
    messages,
    ofType: (type: string) => messages.filter((m) => m.type === type),
    reset: () => {
      messages.length = 0;
    },
  };

  return { binding, spy };
}

function createR2Spy() {
  const objects = new Map<string, { body: string; contentType?: string }>();

  const binding = {
    async put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      const body =
        typeof value === 'string'
          ? value
          : value instanceof ArrayBuffer
            ? Buffer.from(value).toString('utf8')
            : String(value);
      objects.set(key, { body, contentType: options?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body: found.body,
        httpEtag: `"${key}"`,
        async text() {
          return found.body;
        },
        writeHttpMetadata(headers: Headers) {
          if (found.contentType) headers.set('content-type', found.contentType);
        },
      };
    },
    async delete(key: string) {
      objects.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return {
        objects: [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => ({ key: k, size: objects.get(k)!.body.length, uploaded: new Date() })),
        truncated: false,
      };
    },
  };

  const spy: R2Spy = {
    objects,
    reset: () => objects.clear(),
  };

  return { binding, spy };
}

/**
 * Creates a fresh `Env` plus handles to the recording spies.
 * `baseUrl` must match the origin used by the test HTTP client so that Better
 * Auth accepts the request as same-origin.
 */
export function createTestEnv(baseUrl = 'http://localhost:8788'): TestEnv {
  const queue = createQueueSpy();
  const r2 = createR2Spy();

  const env: Record<string, unknown> = {
    DATABASE_URL: TEST_DATABASE_URL,
    BETTER_AUTH_SECRET: 'test-better-auth-secret-value-at-least-32-chars',
    BETTER_AUTH_URL: baseUrl,
    JWT_SECRET: 'test-jwt-secret-value-for-invite-tokens',

    PANEL_URL: 'http://localhost:3001',
    CONSOLE_URL: 'http://localhost:3003',
    R2_PUBLIC_URL: 'http://localhost:8788/api/public/files',

    // Deliberately absent: UPSTASH_* (cache no-ops), RESEND_* (jobs-worker's job),
    // CLOUDFLARE_AI_* / OPENROUTER_API_KEY (AI routes assert their own 503s).

    FILES_BUCKET: r2.binding,
    TASK_QUEUE: queue.binding,
  };

  return { env, queue: queue.spy, r2: r2.spy };
}
