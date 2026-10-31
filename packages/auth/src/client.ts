import { createAuthClient } from 'better-auth/react';
import { AUTH_CLIENT_DEFAULTS } from './client-config';
import { requireApiBaseUrl } from './env';

/**
 * Next.js auth client. The browser talks to the API on a different origin, so
 * the base URL is required: a missing value throws instead of falling back to
 * an invented port (AGENTS.md §10).
 */
export const authClient = createAuthClient({
  ...AUTH_CLIENT_DEFAULTS,
  baseURL: requireApiBaseUrl(),
});

export const {
  useSession,
  organization,
} = authClient;

/**
 * Precise type of a configured client (plugins included). The framework-free
 * factories in `./org-hooks` and `./session-actions` are typed against it, so a
 * client built from the same defaults stays interchangeable.
 */
export type AuthClient = typeof authClient;

export type { User, Session, SignInParams, SignUpParams } from './client-config';
