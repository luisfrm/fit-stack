import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    reporters: ['default'],
    // Explicit test values: the runtime configuration is REQUIRED (no silent
    // fallbacks), so the test environment provides it deliberately.
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8788',
      NEXT_PUBLIC_R2_URL: 'http://localhost:8788',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
