import { createContext } from "react-router";

/**
 * Cloudflare runtime values exposed to the route modules.
 *
 * React Router v8 replaced the `AppLoadContext` module augmentation with typed
 * contexts (`createContext` + `RouterContextProvider`), so bindings reach a
 * loader through `context.get(cloudflareContext)` instead of
 * `context.cloudflare`. Reading a context that was never set throws.
 */
export interface CloudflareContext {
  readonly env: Env;
  readonly ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareContext>();
