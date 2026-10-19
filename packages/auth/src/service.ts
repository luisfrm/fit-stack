import { FetchError, ofetch } from "ofetch";
import { authClient, type Session, type User, type SignInParams, type SignUpParams } from "./client";
import { requireApiBaseUrl } from "./env";
import { type PlatformRole, type IAuthError } from '@workspace/shared';

export const sessionService = {
  async getSession(customHeaders?: Headers): Promise<{ data: Session | null; error: IAuthError | null }> {
    if (globalThis.window === undefined) {
      try {
        const { headers: nextHeaders } = await import("next/headers");
        const reqHeaders = customHeaders || await nextHeaders();

        // Pass only essential auth headers (cookie & authorization)
        // to prevent forwarding frontend Host header to backend API server
        const cleanHeaders = new Headers();
        const cookie = reqHeaders.get("cookie");
        if (cookie) cleanHeaders.set("cookie", cookie);
        const authorization = reqHeaders.get("authorization");
        if (authorization) cleanHeaders.set("authorization", authorization);

        const result = await authClient.getSession({ fetchOptions: { headers: cleanHeaders } });
        return { data: result?.data as Session | null, error: (result?.error as IAuthError) || null };
      } catch (error: any) {
        console.error("Error fetching session on server:", error);
        return { data: null, error: error as IAuthError };
      }
    }

    const result = await authClient.getSession();
    return { data: result?.data as Session | null, error: (result?.error as IAuthError) || null };
  },

  async getServerSession(headers: Headers) {
    // Resolved OUTSIDE the `try`: a missing API base URL is a configuration
    // error that must surface as itself, never be reported as a network error.
    const apiBase = requireApiBaseUrl();

    // Pass only essential auth headers (cookie & authorization)
    // to prevent forwarding frontend Host header to backend API server
    const cleanHeaders = new Headers();
    const cookie = headers.get("cookie");
    if (cookie) cleanHeaders.set("cookie", cookie);
    const authorization = headers.get("authorization");
    if (authorization) cleanHeaders.set("authorization", authorization);

    try {
      // `ofetch` (AGENTS.md §8) throws `FetchError` on non-2xx responses, so the
      // HTTP status is read from the error instead of `response.ok`.
      const data = await ofetch<unknown>(`${apiBase}/api/auth/get-session`, {
        headers: cleanHeaders,
        cache: "no-store",
      });
      return { data, error: null };
    } catch (error) {
      if (error instanceof FetchError) {
        const status = error.response?.status ?? error.statusCode ?? 0;
        const statusText =
          error.response?.statusText || error.statusText || String(status);
        return {
          data: null,
          error: {
            code: 'AUTH_API_ERROR',
            message: `Auth API error: ${statusText}`,
            status,
          },
        };
      }
      return { data: null, error: { code: 'NETWORK_ERROR', message: "Error de red al obtener sesión" } };
    }
  },

  async signIn(params: SignInParams): Promise<{ data: any; error: IAuthError | null }> {
    try {
      const result = await authClient.signIn.email(params);
      return { data: result?.data || null, error: (result?.error as IAuthError) || null };
    } catch (err: any) {
      return { data: null, error: err as IAuthError };
    }
  },

  async signUp(params: SignUpParams): Promise<{ data: any; error: IAuthError | null }> {
    try {
      const result = await authClient.signUp.email(params);
      return { data: result?.data || null, error: (result?.error as IAuthError) || null };
    } catch (err: any) {
      return { data: null, error: err as IAuthError };
    }
  },

  async signOut(onSuccess?: () => void) {
    try {
      const result = await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            if (onSuccess) onSuccess();
          }
        }
      });
      return { data: result?.data || true, error: (result?.error as IAuthError) || null };
    } catch (err: any) {
      return { data: null, error: err as IAuthError };
    }
  },

  async setActiveOrganization(organizationId: string | null) {
    try {
      const result = await authClient.organization.setActive({
        organizationId: organizationId || null,
      });
      return { data: result?.data || null, error: (result?.error as IAuthError) || null };
    } catch (err: any) {
      return { data: null, error: err as IAuthError };
    }
  },

  isSuperAdmin(session: Session | null): boolean {
    return session?.user?.role === 'admin';
  },

  async getProfileData(): Promise<User | null> {
    const { data: session } = await this.getSession();
    if (!session) return null;
    return session.user;
  },

  async getUserRole(): Promise<PlatformRole> {
    const { data: session } = await this.getSession();
    return (session?.user?.role as PlatformRole) || 'user';
  },

  async isAdmin(): Promise<boolean> {
    const { data: session } = await this.getSession();
    return session?.user.role === 'admin';
  }
};