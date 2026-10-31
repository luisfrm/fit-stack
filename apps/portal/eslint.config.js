import { config } from "@workspace/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    rules: {
      // Vite build-time constants (`import.meta.env.DEV` / `MODE`), not runtime
      // environment variables: they never belong in turbo.json.
      "turbo/no-undeclared-env-vars": ["warn", { allowList: ["DEV", "MODE"] }],
    },
  },
  {
    // Build output and generated route types are not source.
    ignores: ["build/**", ".react-router/**", ".wrangler/**", "worker-configuration.d.ts"],
  },
];
