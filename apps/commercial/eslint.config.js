import { config as baseConfig } from "@workspace/eslint-config/base";
import pluginAstro from "eslint-plugin-astro";

/**
 * Flat ESLint configuration for the Astro commercial site.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...baseConfig,
  ...pluginAstro.configs.recommended,
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**"],
  },
];
