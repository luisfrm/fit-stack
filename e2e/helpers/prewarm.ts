/**
 * Prewarm de rutas — visita las páginas principales una vez después del login
 * para que Next.js (Turbopack) las compile ANTES de que empiecen los tests.
 *
 * Motivo: el primer request a cada ruta en dev compila on-demand y puede tardar
 * decenas de segundos. Sacarlo del tiempo de los tests es lo que permite correr
 * la suite con `workers: 1` sin que cada journey absorba una compilación en frío.
 *
 * Es best-effort: si una ruta falla o redirige (por ejemplo un guard de
 * features), se avisa por consola y se continúa.
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
