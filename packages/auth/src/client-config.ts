/**
 * Framework-free Better Auth configuration.
 *
 * Shared by every entry point of this package: `./client` (Next.js apps, which
 * supply their own API origin) and `./react-router` (same-origin apps, where the
 * auth server lives behind the app's own Worker).
 *
 * Nothing in this module may import `next/*` or read build-time environment
 * variables: the base URL is the only per-runtime difference and each entry
 * resolves it.
 */
import { customSessionClient, organizationClient } from 'better-auth/client/plugins';
import {
  organizationAc,
  organizationRoles,
  type IAuthMember,
  type IOrganization,
  type ISession,
  type IUser,
} from '@workspace/shared';

/**
 * Configuration every Fit-Stack auth client shares.
 *
 * - `credentials: "include"` so the session cookie travels with every call.
 * - `customSessionClient` exposes the session extensions computed on the server
 *   (`member`, `activeOrganization`).
 * - `organizationClient` adds the organization endpoints and the role matrix
 *   that mirrors `organizationRoles` in `@workspace/shared`.
 */
export const AUTH_CLIENT_DEFAULTS = {
  fetchOptions: {
    credentials: 'include' as const,
  },
  plugins: [
    customSessionClient(),
    organizationClient({
      ac: organizationAc,
      roles: organizationRoles,
    }),
  ],
};

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignUpParams {
  email: string;
  password: string;
  name: string;
}

export type User = IUser;

export interface Session extends ISession {
  member?: IAuthMember | null;
  activeOrganization?: IOrganization | null;
}
