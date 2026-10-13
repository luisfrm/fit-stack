/**
 * Route prewarm — visits the main pages once after login
 * so Next.js (Turbopack) compiles them BEFORE the tests start.
 *
 * Reason: the first request to each route in dev compiles on-demand and can take
 * tens of seconds. Taking it out of the test time is what allows running
 * the suite with `workers: 1` without every journey absorbing a cold compile.
 *
 * It is best-effort: if a route fails or redirects (for example a feature
 * guard), a warning is printed to the terminal and the run continues.
 */
import type { Page } from '@playwright/test';

export async function prewarmRoutes(page: Page, routes: readonly string[]): Promise<void> {
  const started = Date.now();

  for (const route of routes) {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } catch (err) {
      console.warn(`[e2e] prewarm de ${route} falló (se ignora):`, err);
    }
  }

  console.log(`[e2e] prewarm de ${routes.length} rutas en ${Date.now() - started}ms`);
}
