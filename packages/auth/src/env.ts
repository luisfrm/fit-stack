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
 * Resolves the Fit-Stack API base URL.
 *
 * @throws Error naming the missing variable when it is unset or blank, so a
 * misconfigured deployment fails on the first auth call instead of silently
 * targeting a wrong port.
 */
export function requireApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) {
    throw new Error(
      `Missing required env var ${API_BASE_URL_ENV}. Set the Fit-Stack API base URL (e.g. http://localhost:8788) in the environment before using the auth package.`,
    );
  }
  return value;
}
