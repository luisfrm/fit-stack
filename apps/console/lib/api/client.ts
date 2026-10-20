import { createApiClient } from "@workspace/auth/api-client";
import { ORG_CONTEXT_LOST_EVENT } from "@workspace/shared";

/**
 * Single HTTP client instance for this app.
 *
 * The implementation lives in `@workspace/auth/api-client` (shared with the
 * other Next app); this file only wires the app-specific behavior. It keeps
 * exporting `api`, `apiBlob` and `ApiFetchOptions` so services do not change.
 */
const { api, apiBlob } = createApiClient({
  onOrganizationNotFound() {
    if (typeof window === "undefined") return;
    // A fetch interceptor cannot call `useRouter`: it emits an event and
    // `<OrgContextGuard>` navigates with the router.
    window.dispatchEvent(new Event(ORG_CONTEXT_LOST_EVENT));
  },
});

export { api, apiBlob };
export type { ApiFetchOptions } from "@workspace/auth/api-client";
