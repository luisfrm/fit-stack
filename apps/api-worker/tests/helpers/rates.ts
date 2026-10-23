/**
 * Exchange-rate provider stand-ins for tests.
 *
 * `createExchangeRateProvider` reads `EXCHANGE_API_URL`, so a test client can
 * be pointed at a local server (or at a dead port) instead of the real
 * `open.er-api.com`. The response mirrors the provider shape (`result`,
 * `base_code`, `rates`).
 */
import { createServer } from 'node:http';

/**
 * Nothing listens on port 1: the provider call fails with a connection error,
 * which must surface as `503 EXCHANGE_RATE_UNAVAILABLE` (never an assumed 1:1
 * rate). No request leaves the machine.
 */
export const UNREACHABLE_RATE_URL = 'http://127.0.0.1:1/v6/latest';

/**
 * Runs `run` with a local rates API quoting `rates` for the requested base.
 * The server is closed afterwards, even when the assertion fails.
 */
export async function withRateServer<T>(
  rates: Record<string, number>,
  run: (url: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const base = (req.url ?? '/').split('/').filter(Boolean).pop() ?? 'USD';
    res.end(JSON.stringify({ result: 'success', base_code: base, rates: { [base]: 1, ...rates } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  try {
    return await run(`http://127.0.0.1:${port}/v6/latest`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
