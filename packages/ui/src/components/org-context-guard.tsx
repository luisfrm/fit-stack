"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ORG_CONTEXT_LOST_EVENT } from "@workspace/shared";

/**
 * Navigates to `/reset-org-context` when the HTTP client reports that the
 * active organization no longer exists.
 *
 * The ofetch interceptor cannot call `useRouter` (it is not a component), so
 * `createApiClient` emits `ORG_CONTEXT_LOST_EVENT` and this guard performs the
 * navigation with the router instead of `window.location`.
 *
 * Mount it once per app, inside `Providers`.
 */
export function OrgContextGuard() {
  const router = useRouter();

  React.useEffect(() => {
    const handleLostContext = () => {
      router.replace("/reset-org-context");
    };

    window.addEventListener(ORG_CONTEXT_LOST_EVENT, handleLostContext);
    return () => {
      window.removeEventListener(ORG_CONTEXT_LOST_EVENT, handleLostContext);
    };
  }, [router]);

  return null;
}
