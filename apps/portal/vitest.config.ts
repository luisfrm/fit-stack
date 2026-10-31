import { defineConfig } from "vitest/config";

/**
 * Standalone test config: the app's `vite.config.ts` runs the Cloudflare
 * plugin (Workers runtime), which is not a test environment. Unit tests for the
 * portal stay plain Node.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "workers/**/*.test.ts"],
    passWithNoTests: true,
    reporters: ["default"],
  },
});
