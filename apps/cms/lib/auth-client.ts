import { createAuthClient } from 'better-auth/react';
import { customSessionClient, organizationClient } from "better-auth/client/plugins";
import { GlobalRole } from '@workspace/shared';

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
    organizationClient()
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

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  role?: GlobalRole; // Global role (e.g. 'admin')
}

export interface Session {
  user: User;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  };
  member?: {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  activeOrganization?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
    countryCode: string;
    slogan?: string | null;
    taxId?: string | null;
    legalName?: string | null;
    address?: string | null;
    fiscalConfig?: any;
  } | null;
}
