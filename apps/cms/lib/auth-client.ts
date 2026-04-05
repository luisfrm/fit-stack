import { createAuthClient } from 'better-auth/react';
import { customSessionClient, organizationClient } from "better-auth/client/plugins";

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

interface SignInParams {
  email: string;
  password: string;
}

export const signIn = async (params: SignInParams) => {
  try {
    const result = await authClient.signIn.email(params);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

interface SignUpParams {
  email: string;
  password: string;
  name: string;
}

export const signUp = async (params: SignUpParams) => {
  try {
    const result = await authClient.signUp.email(params);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

export const signOut = async (options?: any) => {
  try {
    const result = await authClient.signOut(options);
    return { data: result?.data || true, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

export const getSession = async (options?: any) => {
  try {
    const result = await authClient.getSession(options);
    return { data: result?.data || null, error: result?.error || null };
  } catch (err: any) {
    return { data: null, error: err };
  }
};

export const { 
  useSession,
  organization
} = authClient;

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
  role?: string; // Global role (e.g. 'admin')
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
    ipAddress?: string;
    userAgent?: string;
    activeOrganizationId?: string;
  };
}