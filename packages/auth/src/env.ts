/**
 * Environment resolution for the auth package.
 *
 * AGENTS.md §10: missing configuration must fail visibly; it is NEVER replaced
 * by an invented value (e.g. a hardcoded `http://localhost:3001`, which is not
 * even the API port). AGENTS.md §8: the Fit-Stack API is reached through
 * `ofetch`, never the native `fetch`.
 *
 * The `process.env.NEXT_PUBLIC_API_BASE_URL` access is deliberately literal:
 * Next.js only inlines environment references that appear verbatim in the
 * source of the app bundle. Do not refactor it into a computed key.
 */

/** Name of the env var holding the Fit-Stack API base URL. */
export const API_BASE_URL_ENV = "NEXT_PUBLIC_API_BASE_URL";

/**
 * Build-time tolerance, mirroring `apps/{console,panel}/lib/config/envs.ts`:
 * `next build` evaluates route modules to collect page data, so a missing
 * variable would otherwise break every non-production build (CI, preview).
 * This is NOT a runtime fallback: once the server/client runs, the variable is
 * required and its absence throws (see `requireApiBaseUrl`).
 */
const isProduction = process.env.APP_ENV === "production";
const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  (process.env.CI === "true" && process.env.NODE_ENV !== "test");

/** Only used while collecting page data in a non-production build. */
const BUILD_TIME_API_BASE_URL = "http://localhost:8788";

/**
 * Resolves the Fit-Stack API base URL.
 *
 * @throws Error naming the missing variable when it is unset or blank, so a
 * misconfigured deployment fails on the first auth call instead of silently
 * targeting a wrong port. The only exception is a non-production build, where
 * the build must be able to collect page data without the runtime environment.
 */
export function requireApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (value) {
    return value;
  }

  if (isBuildTime && !isProduction) {
    console.warn(
      `⚠️  Skipping strict auth env validation during build/CI (Non-production): ${API_BASE_URL_ENV} is not set.`,
    );
    return BUILD_TIME_API_BASE_URL;
  }

  throw new Error(
    `Missing required env var ${API_BASE_URL_ENV}. Set the Fit-Stack API base URL (e.g. http://localhost:8788) in the environment before using the auth package.`,
  );
}
