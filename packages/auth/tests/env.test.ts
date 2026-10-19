import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `requireApiBaseUrl` must fail visibly at runtime, but tolerate a missing
 * variable while Next collects page data in a NON-production build (mirroring
 * `apps/{console,panel}/lib/config/envs.ts`). Production builds still throw.
 *
 * The build/runtime flags are module-level constants, so each case resets the
 * module registry and imports `env.ts` after stubbing the environment.
 */
async function importEnv() {
  vi.resetModules();
  return import('../src/env');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('APP_ENV', '');
  vi.stubEnv('CI', '');
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('requireApiBaseUrl', () => {
  it('returns the configured value (trimmed)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', ' https://api.fit-stack.test ');

    const { requireApiBaseUrl } = await importEnv();

    expect(requireApiBaseUrl()).toBe('https://api.fit-stack.test');
  });

  it('throws visibly at runtime when the variable is missing', async () => {
    const { requireApiBaseUrl } = await importEnv();

    expect(() => requireApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it('tolerates a missing variable during a non-production build (warn + placeholder)', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { requireApiBaseUrl } = await importEnv();

    expect(requireApiBaseUrl()).toBe('http://localhost:8788');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still throws during a production build (a deploy must fail visibly)', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');

    const { requireApiBaseUrl } = await importEnv();

    expect(() => requireApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });
});
