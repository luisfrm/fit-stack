"use client";

import { authClient } from "./client";
import { createOrgAuth } from "./org-hooks";

/**
 * Organization ("gym") auth hooks for the Next.js apps.
 *
 * The implementation lives in `./org-hooks` (framework-free); this module only
 * binds it to the Next.js client so the public entry keeps its shape.
 */
export const { useOrgAuth, useOrgPermissions } = createOrgAuth(authClient);
