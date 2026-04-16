import { authClient, type Session, type User, type SignInParams, type SignUpParams } from "@/lib/auth-client";
import { GLOBAL_ROLES, GlobalRole } from "@workspace/shared";

/**
 * Service to handle session-related operations in the CMS.
 * This version is designed to be "isomorphic" (works on server and client).
 */
export const sessionService = {
  /**
   * Gets the current session.
   * @param customHeaders Optional headers (useful for Middleware)
   */
  async getSession(customHeaders?: Headers): Promise<{ data: Session | null; error: unknown }> {
    if (globalThis.window === undefined) {
      try {
        const { headers: nextHeaders } = await import("next/headers");
        const headers = customHeaders || await nextHeaders();
        const result = await authClient.getSession({ fetchOptions: { headers } });
        return { data: result?.data as Session | null, error: result?.error || null };
      } catch (error) {
        console.error("Error fetching session on server:", error);
        return { data: null, error };
      }
    }

    const result = await authClient.getSession();
    return { data: result?.data as Session | null, error: result?.error || null };
  },

  /**
   * 🛡️ Server-Side Session Fetcher (Middleware/Direct Fetch)
   * Designed to work in Edge Runtime where standard clients might fail.
   */
  async getServerSession(headers: Headers) {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

    try {
      const response = await fetch(`${apiBase}/api/auth/get-session`, {
        headers,
        cache: 'no-store',
      });

      if (!response.ok) {
        return { data: null, error: `Auth API error: ${response.statusText}` };
      }

      const data = await response.json();
      return { data, error: null };
    } catch {
      return { data: null, error: "Error de red al obtener sesión" };
    }
  },

  /**
   * Signs in a user with email and password.
   */
  async signIn(params: SignInParams) {
    try {
      const result = await authClient.signIn.email(params);
      return { data: result?.data || null, error: result?.error || null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  /**
   * Registers a new user.
   */
  async signUp(params: SignUpParams) {
    try {
      const result = await authClient.signUp.email(params);
      return { data: result?.data || null, error: result?.error || null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  /**
   * Signs out the current user.
   */
  async signOut(onSuccess?: () => void) {
    try {
      const result = await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            if (onSuccess) onSuccess();
          }
        }
      });
      return { data: result?.data || true, error: result?.error || null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  /**
   * 🏢 Sets the active organization context for the current session.
   */
  async setActiveOrganization(organizationId: string | null) {
    try {
      const result = await authClient.organization.setActive({
        organizationId: organizationId || null,
      });
      return { data: result?.data || null, error: result?.error || null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  /**
   * 🛡️ Helper to check if the current user has Super Admin (Global) privileges.
   */
  isSuperAdmin(session: Session | null): boolean {
    return session?.user?.role === GLOBAL_ROLES.ADMIN;
  },

  /**
   * Placeholder for future profile data fetching
   */
  async getProfileData(): Promise<User | null> {
    const { data: session } = await this.getSession();
    if (!session) return null;
    return session.user;
  },

  /**
   * Helper to get user role name.
   */
  async getUserRole(): Promise<GlobalRole> {
    const { data: session } = await this.getSession();
    return (session?.user?.role as GlobalRole) || GLOBAL_ROLES.USER;
  },

  /**
   * Check if current user is Admin.
   */
  async isAdmin(): Promise<boolean> {
    const { data: session } = await this.getSession();
    return session?.user.role === GLOBAL_ROLES.ADMIN;
  }
};
