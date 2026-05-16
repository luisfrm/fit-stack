import { authClient, type Session, type User, type SignInParams, type SignUpParams } from "@/lib/auth-client";
import { GLOBAL_ROLES, GlobalRole, type IAuthError } from "@workspace/shared";

export const sessionService = {
  async getSession(customHeaders?: Headers): Promise<{ data: Session | null; error: IAuthError | null }> {
    if (globalThis.window === undefined) {
      try {
        const { headers: nextHeaders } = await import("next/headers");
        const headers = customHeaders || await nextHeaders();
        const result = await authClient.getSession({ fetchOptions: { headers } });
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
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

    try {
      const response = await fetch(`${apiBase}/api/auth/get-session`, {
        headers,
        cache: 'no-store',
      });

      if (!response.ok) {
        return { data: null, error: { code: 'AUTH_API_ERROR', message: `Auth API error: ${response.statusText}`, status: response.status } };
      }

      const data = await response.json();
      return { data, error: null };
    } catch {
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
    return session?.user?.role === GLOBAL_ROLES.ADMIN;
  },

  async getProfileData(): Promise<User | null> {
    const { data: session } = await this.getSession();
    if (!session) return null;
    return session.user;
  },

  async getUserRole(): Promise<GlobalRole> {
    const { data: session } = await this.getSession();
    return (session?.user?.role as GlobalRole) || GLOBAL_ROLES.USER;
  },

  async isAdmin(): Promise<boolean> {
    const { data: session } = await this.getSession();
    return session?.user.role === GLOBAL_ROLES.ADMIN;
  }
};