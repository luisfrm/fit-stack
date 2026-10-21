import { createApiClient } from "@workspace/auth/api-client";

/**
 * Single HTTP client instance for this app.
 *
 * The implementation lives in `@workspace/auth/api-client` (shared with the
 * other Next app); this file only wires the app-specific behavior. It keeps
 * exporting `api`, `apiBlob` and `ApiFetchOptions` so services do not change.
 */
const { api, apiBlob } = createApiClient();

export { api, apiBlob };
export type { ApiFetchOptions } from "@workspace/auth/api-client";
