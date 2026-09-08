import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Clicks a navigation link and waits for the URL to change.
 *
 * These apps are Next.js client components: a click that lands before React
 * hydration completes (or while the dev server recompiles and replaces the
 * DOM node) can be a no-op. This helper retries the click until the URL
 * actually matches, and never clicks again once it already does.
 */
export async function navigateByClick(
  page: Page,
  locator: Locator,
  urlPattern: RegExp,
  timeout = 20_000,
): Promise<void> {
  await expect(async () => {
    const alreadyThere = urlPattern.test(page.url());
    if (!alreadyThere) {
      await locator.click({ timeout: 5_000 });
    }
    await expect(page).toHaveURL(urlPattern, { timeout: 3_000 });
  }).toPass({ timeout });
}