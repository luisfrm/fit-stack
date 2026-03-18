import { auth } from "@/lib/auth-client";

/**
 * Service to handle session-related operations in the CMS.
 * This version is designed to be "isomorphic" (works on server and client).
 */
export const sessionService = {
  /**
   * Gets the current session.
   * On the server, it automatically handles headers.
   * @param customHeaders Optional headers (useful for Middleware)
   */
  async getSession(customHeaders?: Headers) {
    try {
      let fetchOptions = {};

      if (globalThis.window === undefined) {
        // SERVER SIDE: Dinamic import to avoid client-side crashes
        const { headers: nextHeaders } = await import("next/headers");
        const headers = customHeaders || await nextHeaders();
        fetchOptions = { headers };
      }

      return await auth.getSession({
        fetchOptions
      });
    } catch (error) {
      console.error("Error fetching session in sessionService:", error);
      return { data: null, error };
    }
  },

  /**
   * Signs out the current user.
   * @param onSuccess Callback to run after successful sign-out (e.g., redirect)
   */
  async signOut(onSuccess?: () => void) {
    return await auth.signOut({
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
