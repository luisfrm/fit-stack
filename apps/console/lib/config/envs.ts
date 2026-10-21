import { requireEnvValue } from "@workspace/auth/env";

/**
 * Frontend environment for the Console.
 *
 * Only `NEXT_PUBLIC_R2_URL` is resolved here. The Fit-Stack API base URL is
 * resolved once by `@workspace/auth/api-client` (`requireApiBaseUrl`) and the
 * exchange-rate provider URL defaults to `@workspace/shared`.
 *
 * The literal `process.env.NEXT_PUBLIC_R2_URL` read stays in this file: Next.js
 * only inlines environment references that appear verbatim in the app bundle.
 * The validation and build-time rule live in `@workspace/auth/env`.
 */
export const env = {
  r2Url: requireEnvValue("NEXT_PUBLIC_R2_URL", process.env.NEXT_PUBLIC_R2_URL, {
    buildTimeValue: "http://localhost:8788",
    message:
      "Missing required env var NEXT_PUBLIC_R2_URL. Set the public R2 base URL before serving the Console.",
  }),
};
