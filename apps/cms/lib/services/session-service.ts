import { getSession, signOut } from "@/lib/auth-client";

/**
 * Service to handle session-related operations in the CMS.
 * This version is designed to be "isomorphic" (works on server and client).
 */
export const sessionService = {
  /**
   * Gets the current session.
   * @param customHeaders Optional headers (useful for Middleware)
   */
  async getSession(customHeaders?: Headers) {
    let fetchOptions = {};

    if (globalThis.window === undefined) {
      const { headers: nextHeaders } = await import("next/headers");
      const headers = customHeaders || await nextHeaders();
      fetchOptions = { headers };
    }

    return await getSession({ fetchOptions });
  },

  /**
   * 🛡️ Server-Side Session Fetcher (Middleware/Direct Fetch)
   * Designed to work in Edge Runtime where standard clients might fail.
   */
  async getServerSession(headers: Headers) {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
    
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
  async getProfileData() {
    const { data: session } = await this.getSession();
    if (!session) return null;
    return session.user;
  }
};
