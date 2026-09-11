/**
 * Fixtures compartidas de los E2E.
 *
 * Los specs importan `test` y `expect` desde aquí (no desde `@playwright/test`)
 * y reciben:
 *
 * - `tenant`     → estado del tenant sembrado por el global-setup (org + ids).
 * - `panelApi`   → API del api-worker autenticada como OWNER del gimnasio.
 * - `consoleApi` → API autenticada como platform owner (specs de consola).
 *
 * Ambos clientes borran automáticamente lo que el test cree (ver
 * `helpers/api-client.ts`), así que un test fallido no deja datos atrás.
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
  // `tenant` es de solo lectura: no necesita aislamiento por test.
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
