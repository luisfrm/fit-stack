/**
 * Shared fixtures of the E2E suite.
 *
 * Specs import `test` and `expect` from here (not from `@playwright/test`)
 * and receive:
 *
 * - `tenant`     → state of the tenant seeded by the global-setup (org + ids).
 * - `panelApi`   → api-worker API authenticated as the gym OWNER.
 * - `consoleApi` → API authenticated as platform owner (console specs).
 *
 * Both clients automatically delete whatever the test creates (see
 * `helpers/api-client.ts`), so a failing test leaves no data behind.
 */
import {
  test as base,
  expect,
  type PlaywrightTestArgs,
  type PlaywrightWorkerArgs,
} from '@playwright/test';
import { apiJson, API_BASE_URL } from './helpers/api';
import {
  cleanupDisposables,
  createApiClient,
  newAuthedApiContext,
  type ApiClient,
  type Disposable,
} from './helpers/api-client';
import { CONSOLE_STATE_PATH, PANEL_STATE_PATH, readTenantState } from './helpers/test-tenant';

type Fixtures = {
  tenant: ReturnType<typeof readTenantState>;
  panelApi: ApiClient;
  consoleApi: ApiClient;
};

type WorkerFixtures = PlaywrightTestArgs & PlaywrightWorkerArgs;

async function buildApi(
  playwright: WorkerFixtures['playwright'],
  storageState: string,
): Promise<{ client: ApiClient; disposables: Disposable[]; context: any }> {
  const context = await newAuthedApiContext(playwright, storageState);
  const disposables: Disposable[] = [];
  return { client: createApiClient(context, disposables), disposables, context };
}

export const test = base.extend<Fixtures>({
  // `tenant` is read-only: it needs no per-test isolation.
  tenant: async ({}, use) => {
    await use(readTenantState());
  },

  panelApi: async ({ playwright }, use) => {
    const { client, disposables, context } = await buildApi(playwright, PANEL_STATE_PATH);
    try {
      await use(client);
    } finally {
      await cleanupDisposables(client, disposables);
      await context.dispose();
    }
  },

  consoleApi: async ({ playwright }, use) => {
    const { client, disposables, context } = await buildApi(playwright, CONSOLE_STATE_PATH);
    try {
      await use(client);
    } finally {
      await cleanupDisposables(client, disposables);
      await context.dispose();
    }
  },
});

export { expect, API_BASE_URL, apiJson };
export type { ApiClient };
