/**
 * React Router entry (`@workspace/auth/react-router`).
 *
 * Same client, different transport: the auth server lives behind the app's own
 * Worker (the portal proxies `/api/*`), so the browser stays same-origin and
 * Better Auth derives the base URL from `window.location.origin`.
 *
 * This module must never reach `next/*` or evaluate `process.env`: it is the
 * entry used by apps that do not run Next.js.
 */
import { createAuthClient } from "better-auth/react";
import { AUTH_CLIENT_DEFAULTS } from "./client-config";
import { createOrgAuth } from "./org-hooks";
import { createSessionActions } from "./session-actions";

/** Same-origin client: no `baseURL` on purpose. */
export const authClient = createAuthClient(AUTH_CLIENT_DEFAULTS);

export const { useSession } = authClient;
export const { useOrgAuth, useOrgPermissions } = createOrgAuth(authClient);
export const sessionActions = createSessionActions(authClient);

export type { Session, User } from "./client-config";
