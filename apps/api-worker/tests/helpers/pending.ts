/**
 * Registry of fire-and-forget work started by test requests via
 * `ExecutionContext.waitUntil`.
 *
 * The real Worker runtime runs `waitUntil` work in the background; the test
 * client awaits it inline (see `createExecutionContext`). Tracking it globally
 * lets `truncateAll()` drain any stragglers before wiping the database, so a
 * previous file's queued work can never race the next file's `TRUNCATE` (which
 * would delete sessions/members mid-run and surface as spurious 401/403).
 */

const PENDING = new Set<Promise<unknown>>();

/** Registers a promise so it can be awaited globally before truncating. */
export function trackPending(promise: Promise<unknown>): void {
  PENDING.add(promise);
  const forget = () => PENDING.delete(promise);
  promise.then(forget, forget);
}

/**
 * Waits for every registered promise to settle, looping because settling one
 * batch can register more work. Bounded by `timeoutMs` so a hung promise cannot
 * stall the whole suite.
 */
export async function drainAllPending(timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (PENDING.size > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await withTimeout(Promise.allSettled([...PENDING]), remaining);
  }
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise.then(() => undefined), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
