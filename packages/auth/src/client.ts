import { createAuthClient } from 'better-auth/react';
import { customSessionClient, organizationClient } from "better-auth/client/plugins";
import { organizationAc, organizationRoles, IUser, ISession, IOrganization, IAuthMember } from '@workspace/shared';
import { requireApiBaseUrl } from './env';

export const authClient = createAuthClient({
  // Required configuration: a missing base URL throws instead of falling back
  // to an invented port (AGENTS.md §10).
  baseURL: requireApiBaseUrl(),
  fetchOptions: {
    credentials: 'include',
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [
    customSessionClient(),
    organizationClient({
      ac: organizationAc,
      roles: organizationRoles,
    })
  ]
});

export interface SignInParams {
  email: string;
  password: string;
}

export interface SignUpParams {
  email: string;
  password: string;
  name: string;
}

export const {
  useSession,
  organization,
} = authClient;

export type User = IUser;
export interface Session extends ISession {
  member?: IAuthMember | null;
  activeOrganization?: IOrganization | null;
}