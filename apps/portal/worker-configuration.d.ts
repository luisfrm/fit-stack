/**
 * Bindings of the `fit-stack-portal` Worker.
 *
 * Declared by hand instead of `wrangler types` because only the bindings this
 * app uses are relevant. Keep it in sync with `wrangler.jsonc`: a binding that
 * exists there and not here is invisible to the type checker.
 */
interface Env {
  /** Service binding to the Fit-Stack API Worker. Required in every deployed environment. */
  readonly API: Fetcher;

  /**
   * Development-only HTTP origin of a locally running api-worker (`.dev.vars`).
   *
   * `@cloudflare/vite-plugin` runs its own Miniflare instance and does not share
   * the `wrangler dev` service registry, so the `API` binding may not resolve in
   * `vite dev`. Ignored outside dev.
   */
  readonly API_DEV_URL?: string;
}
