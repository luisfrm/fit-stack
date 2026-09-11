import { defineConfig } from '@playwright/test';
import { CONSOLE_STATE_PATH, PANEL_STATE_PATH } from './e2e/helpers/test-tenant';

const PANEL_URL = 'http://localhost:3001';
const CONSOLE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8788';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Un solo worker: la suite comparte UNA organización y una sola base de datos
  // de desarrollo. Con 2 workers, dos archivos escribían en la misma org a la
  // vez (de ahí los huecos de orden y los warms manuales de RSC). El costo de
  // compilación se absorbe con el prewarm de rutas de los setups.
  workers: 1,
  // Next.js dev (Turbopack) puede tardar en el primer request por ruta; 60s
  // absorbe compilaciones en frío sin enmascarar fallos reales.
  timeout: 60_000,
  reporter: [['html', { open: 'never' }], ['list']],

  // Ciclo de vida del tenant compartido (crear/reset → borrar).
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: PANEL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    expect: { timeout: 15_000 },
  },

  projects: [
    // Orden: primero consola, después panel. Con workers: 1 los proyectos
    // corren en este orden: la consola crea/gestiona orgs y el panel opera
    // sobre la org de la suite. Los filtros --project siguen funcionando
    // aislados (cada uno arrastra solo su setup de login).

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
        storageState: CONSOLE_STATE_PATH,
      },
    },

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
        storageState: PANEL_STATE_PATH,
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter api-worker dev',
      url: `${API_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter panel dev',
      url: PANEL_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter console dev',
      url: CONSOLE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
