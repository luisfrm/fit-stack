import { createAuthClient } from 'better-auth/react';
import { customSessionClient, organizationClient } from "better-auth/client/plugins";
import { orgRoleDefinitions, IUser, ISession, IOrganization } from '@workspace/shared';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL!,
  fetchOptions: {
    credentials: 'include',
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutos
    },
  },
  plugins: [
    customSessionClient(),
    organizationClient({
      roles: orgRoleDefinitions
    })
  ]
});

// ── WRAPPERS FOR COMPATIBILITY ──

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
  useActiveOrganization,
  organization,
} = authClient;

export interface User extends IUser { }
export interface Session extends ISession {
  member?: {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  activeOrganization?: IOrganization | null;
}
