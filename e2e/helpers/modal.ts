import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Clicks a modal trigger and waits for the dialog to appear.
 *
 * These apps are Next.js client components: a click that lands before React
 * hydration completes is a no-op, so this helper retries the click until the
 * dialog is actually open. It never clicks again once the dialog is already
 * visible (a second click through the overlay would close it).
 */
export async function openModal(
  page: Page,
  trigger: Locator,
  timeout = 25_000,
): Promise<Locator> {
  const dialog = page.getByRole('dialog');

  await expect(async () => {
    const isOpen = await dialog.isVisible().catch(() => false);
    if (!isOpen) {
      await trigger.click({ timeout: 5_000 });
    }
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout });

  return dialog;
}