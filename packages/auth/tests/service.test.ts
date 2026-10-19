import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getServerSession` must:
 * - fail VISIBLY when `NEXT_PUBLIC_API_BASE_URL` is missing (never fall back to
 *   an invented port, AGENTS.md §10);
 * - reach the API through `ofetch`, not the native `fetch` (AGENTS.md §8);
 * - keep the `{ data, error }` contract: `AUTH_API_ERROR` + status for non-2xx
 *   responses, `NETWORK_ERROR` for transport failures.
 */
const { ofetchMock } = vi.hoisted(() => ({ ofetchMock: vi.fn() }));

vi.mock('ofetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ofetch')>();
  return { ...actual, ofetch: ofetchMock };
});

// The client module resolves the base URL at import time (Better Auth client),
// so it is mocked: this suite covers the server-session path only.
vi.mock('../src/client', () => ({
  authClient: {
    getSession: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    organization: { setActive: vi.fn() },
  },
}));

import { FetchError } from 'ofetch';
import { sessionService } from '../src/service';

const SESSION_PAYLOAD = {
  session: { id: 'session-1', activeOrganizationId: 'org-1' },
  user: { id: 'user-1', email: 'owner@fit-stack.test' },
};

function authHeaders(): Headers {
  const headers = new Headers();
  headers.set('cookie', 'better-auth.session_token=token');
  return headers;
}

beforeEach(() => {
  ofetchMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sessionService.getServerSession', () => {
  it('throws a visible error naming the variable when NEXT_PUBLIC_API_BASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(sessionService.getServerSession(authHeaders())).rejects.toThrow(
      /NEXT_PUBLIC_API_BASE_URL/,
    );
    // No silent fallback to a hardcoded port: the API is never called.
    expect(ofetchMock).not.toHaveBeenCalled();
  });

  it('calls the API with ofetch and a no-store cache', async () => {
    ofetchMock.mockResolvedValue(SESSION_PAYLOAD);

    await sessionService.getServerSession(authHeaders());

    expect(ofetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = ofetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('http://api.test/api/auth/get-session');
    expect(options.cache).toBe('no-store');
    expect(options.headers).toBeInstanceOf(Headers);
    expect((options.headers as Headers).get('cookie')).toBe(
      'better-auth.session_token=token',
    );
  });

  it('maps a non-2xx response to AUTH_API_ERROR with the HTTP status', async () => {
    const fetchError = new FetchError('Unauthorized');
    fetchError.response = {
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as NonNullable<FetchError['response']>;
    ofetchMock.mockRejectedValue(fetchError);

    const result = await sessionService.getServerSession(authHeaders());

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      code: 'AUTH_API_ERROR',
      status: 401,
    });
    expect(result.error?.message).toContain('Unauthorized');
  });

  it('maps a transport failure to NETWORK_ERROR', async () => {
    ofetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await sessionService.getServerSession(authHeaders());

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('NETWORK_ERROR');
  });

  it('returns the session payload on success', async () => {
    ofetchMock.mockResolvedValue(SESSION_PAYLOAD);

    const result = await sessionService.getServerSession(authHeaders());

    expect(result.error).toBeNull();
    expect(result.data).toEqual(SESSION_PAYLOAD);
  });
});
