/**
 * Global setup: serializes api-worker test runs against the shared test
 * database.
 *
 * Every test file calls `TRUNCATE` on the same Neon branch, so two `vitest`
 * processes running at once corrupt each other's fixtures (sessions/members
 * vanish mid-run and surface as spurious 401/403). Vitest already serializes
 * files *within* a process; this filesystem lock guards *across* processes.
 *
 * A filesystem lock is used instead of `pg_advisory_lock` because the Neon HTTP
 * driver is stateless: a session-scoped lock would not persist across requests.
 *
 * Override with `ALLOW_PARALLEL_DB_TESTS=1` for intentional parallel runs that
 * target different branches.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDevVars } from './load-env';

const LOCK_DIR = resolve(__dirname, '../.vitest-db.lock');
const LOCK_INFO = resolve(LOCK_DIR, 'info.json');
const STALE_MS = 30 * 60 * 1000;

interface LockInfo {
  pid: number;
  startedAt: number;
  target: string;
}

function readLock(): LockInfo | null {
  try {
    return JSON.parse(readFileSync(LOCK_INFO, 'utf8')) as LockInfo;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Masks credentials so the lock file never stores a raw connection string. */
function maskTarget(url: string): string {
  return url.replace(/:([^@]+)@/, ':***@');
}

function release(): void {
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

export async function setup(): Promise<void> {
  loadDevVars();

  if (!process.env.TEST_DATABASE_URL) return;
  if (process.env.ALLOW_PARALLEL_DB_TESTS === '1') return;

  const existing = readLock();
  if (existing) {
    const stale = !isProcessAlive(existing.pid) || Date.now() - existing.startedAt > STALE_MS;
    if (!stale) {
      throw new Error(
        `Another api-worker test run (pid ${existing.pid}, started ` +
          `${new Date(existing.startedAt).toISOString()}) is already using the shared test database. ` +
          `Wait for it to finish, point at a different branch, or set ALLOW_PARALLEL_DB_TESTS=1 to override.`,
      );
    }
    release();
  }

  if (existsSync(LOCK_DIR)) release();
  mkdirSync(LOCK_DIR, { recursive: false });
  writeFileSync(
    LOCK_INFO,
    JSON.stringify({
      pid: process.pid,
      startedAt: Date.now(),
      target: maskTarget(process.env.TEST_DATABASE_URL),
    } satisfies LockInfo),
  );

  process.on('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      release();
      process.exit(0);
    });
  }
}

export async function teardown(): Promise<void> {
  // Only release a lock we own: when `setup()` aborts because another run holds
  // the lock, vitest still calls `teardown()` — which must not delete that
  // other run's lock (that would let a third run slip in).
  const info = readLock();
  if (!info || info.pid === process.pid) release();
}
