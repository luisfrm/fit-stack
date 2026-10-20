/**
 * Environment resolution for the frontend runtime.
 *
 * AGENTS.md §10: missing configuration must fail visibly; it is NEVER replaced
 * by an invented value (e.g. a hardcoded `http://localhost:3001`, which is not
 * even the API port). AGENTS.md §8: the Fit-Stack API is reached through
 * `ofetch`, never the native `fetch`.
 *
 * The `process.env.NEXT_PUBLIC_*` accesses are deliberately literal: Next.js
 * only inlines environment references that appear verbatim in the source of
 * the app bundle. Each app keeps its own literal read and passes the value to
 * `requireEnvValue`; the validation/build-time logic lives here exactly once.
 */

/** Name of the env var holding the Fit-Stack API base URL. */
export const API_BASE_URL_ENV = "NEXT_PUBLIC_API_BASE_URL";

/**
 * Build-time tolerance: `next build` evaluates route modules to collect page
 * data, so a missing variable would otherwise break every non-production build
 * (CI, preview).
 *
 * This is NOT a runtime fallback: once the server/client runs, the variable is
 * required and its absence throws (see `requireEnvValue`). Production builds
 * still throw.
 */
const isProduction = process.env.APP_ENV === "production";
const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  (process.env.CI === "true" && process.env.NODE_ENV !== "test");

/** Only used while collecting page data in a non-production build. */
const BUILD_TIME_API_BASE_URL = "http://localhost:8788";

export interface RequiredEnvOptions {
  /**
   * Placeholder used ONLY while collecting page data in a non-production
   * build. It is never served to a running deployment.
   */
  readonly buildTimeValue: string;
  /** Optional specific error; defaults to a message naming the variable. */
  readonly message?: string;
}

/**
 * Resolves a required public environment variable.
 *
 * The caller keeps the literal `process.env.NEXT_PUBLIC_*` read (Next needs it
 * verbatim to inline the value) and passes the raw value here. This function
 * owns the single build-time/runtime rule shared by the apps and this package.
 *
 * @throws Error naming the missing variable when it is unset or blank, so a
 * misconfigured deployment fails visibly instead of silently targeting a wrong
 * value. The only exception is a non-production build.
 */
export function requireEnvValue(
  name: string,
  rawValue: string | undefined,
  options: RequiredEnvOptions,
): string {
  const value = rawValue?.trim();
  if (value) {
    return value;
  }

  if (isBuildTime && !isProduction) {
    console.warn(
      `⚠️  Skipping strict env validation during build/CI (Non-production): ${name} is not set.`,
    );
    return options.buildTimeValue;
  }

  throw new Error(
    options.message ??
      `Missing required env var ${name}. Set it in the environment before serving the app.`,
  );
}

/**
 * Resolves the Fit-Stack API base URL.
 *
 * @throws Error naming the missing variable when it is unset or blank, so a
 * misconfigured deployment fails on the first auth call instead of silently
 * targeting a wrong port.
 */
export function requireApiBaseUrl(): string {
  return requireEnvValue(
    API_BASE_URL_ENV,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    {
      buildTimeValue: BUILD_TIME_API_BASE_URL,
      message: `Missing required env var ${API_BASE_URL_ENV}. Set the Fit-Stack API base URL (e.g. http://localhost:8788) in the environment before using the auth package.`,
    },
  );
}
