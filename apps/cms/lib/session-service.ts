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
      // SERVER SIDE: Dynamic import
      const { headers: nextHeaders } = await import("next/headers");
      const headers = customHeaders || await nextHeaders();
      fetchOptions = { headers };
    }

    // Since our lib's getSession already catches, we just pass the options
    return await getSession({ fetchOptions });
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
