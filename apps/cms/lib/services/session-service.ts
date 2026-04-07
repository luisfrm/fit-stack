import { getSession, signOut, type Session, type User } from "@/lib/auth-client";
import { ROLES } from "@workspace/shared/types";
import { getRoleName } from "@/lib/utils/auth";

/**
 * Service to handle session-related operations in the CMS.
 * This version is designed to be "isomorphic" (works on server and client).
 */
export const sessionService = {
  /**
   * Gets the current session.
   * @param customHeaders Optional headers (useful for Middleware)
   */
  async getSession(customHeaders?: Headers): Promise<{ data: Session | null; error: any }> {
    if (globalThis.window === undefined) {
      try {
        const { headers: nextHeaders } = await import("next/headers");
        const headers = customHeaders || await nextHeaders();
        return await getSession({ fetchOptions: { headers } }) as { data: Session | null; error: any };
      } catch (error) {
        console.error("Error fetching session on server:", error);
        return { data: null, error };
      }
    }

    return await getSession() as { data: Session | null; error: any };
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
   * Signs out the current user.
   */
  async signOut(onSuccess?: () => void) {
    return await signOut({
      fetchOptions: {
        onSuccess: () => {
          if (onSuccess) onSuccess();
        }
      }
    });
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
  async getUserRole(): Promise<string> {
    const { data: session } = await this.getSession();
    return getRoleName(session?.user);
  },

  /**
   * Check if current user is Admin.
   */
  async isAdmin(): Promise<boolean> {
    const { data: session } = await this.getSession();
    return session?.user.role === ROLES.ADMIN;
  }
};
