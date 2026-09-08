import { defineConfig, devices } from '@playwright/test';

const PANEL_URL = 'http://localhost:3001';
const CONSOLE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8788';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Limit local parallelism: Next.js dev + Turbopack compile on demand and the
  // api-worker shares one dev DB — too many concurrent workers causes compile
  // storms and request timeouts on cold starts.
  workers: process.env.CI ? 1 : 2,
  // Next.js dev (Turbopack) can take a long time on first request per route;
  // 60s absorbs cold compiles without masking real failures.
  timeout: 60_000,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: PANEL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    expect: { timeout: 15_000 },
  },

  projects: [
    // ─── Panel ──────────────────────────────────────────────────────────────
    {
      name: 'panel-setup',
      testMatch: /panel-setup\.ts/,
      use: {
        baseURL: PANEL_URL,
        storageState: undefined,
      },
    },
    {
      name: 'panel',
      dependencies: ['panel-setup'],
      testDir: './e2e/panel',
      use: {
        baseURL: PANEL_URL,
        storageState: 'e2e/.auth/panel-user.json',
      },
    },

    // ─── Console ────────────────────────────────────────────────────────────
    {
      name: 'console-setup',
      testMatch: /console-setup\.ts/,
      use: {
        baseURL: CONSOLE_URL,
        storageState: undefined,
      },
    },
    {
      name: 'console',
      dependencies: ['console-setup'],
      testDir: './e2e/console',
      use: {
        baseURL: CONSOLE_URL,
        storageState: 'e2e/.auth/console-user.json',
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter api-worker dev',
      url: `${API_URL}/healthz`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter panel dev',
      url: PANEL_URL,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter console dev',
      url: CONSOLE_URL,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
