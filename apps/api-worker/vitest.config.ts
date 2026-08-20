import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],

    // Integration tests share a single Neon branch, so they must never run
    // concurrently: parallel suites would truncate each other's fixtures.
    fileParallelism: false,
    sequence: { concurrent: false },

    // Every request is a real HTTP round-trip to Neon over the internet.
    testTimeout: 60_000,
    hookTimeout: 120_000,

    reporters: ['default'],
  },
  esbuild: {
    target: 'es2022',
  },
});
