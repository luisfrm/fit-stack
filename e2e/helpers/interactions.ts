import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Clicks `trigger` until `target` is rendered, then clicks `target`.
 *
 * These apps are Next.js client components: a click that lands before React
 * hydration completes is a no-op, so the revealed element (menu item, combo
 * option, …) never appears. The trigger is never clicked again once the target
 * is visible — a second click would close the overlay.
 */
async function clickRevealing(
  trigger: Locator,
  target: Locator,
  timeout: number,
): Promise<void> {
  await expect(async () => {
    const isVisible = await target.isVisible().catch(() => false);
    if (!isVisible) {
      await trigger.click({ timeout: 5_000 });
    }
    await expect(target).toBeVisible({ timeout: 3_000 });
    await target.click({ timeout: 5_000 });
  }).toPass({ timeout });
}

/** Opens a dropdown menu from `trigger` and clicks the item with `name`. */
export async function clickMenuItem(
  page: Page,
  trigger: Locator,
  name: string | RegExp,
  timeout = 25_000,
): Promise<void> {
  await clickRevealing(trigger, page.getByRole('menuitem', { name }), timeout);
}

/**
 * Opens a combobox (`SimpleSelect`) from `trigger` and picks the option with
 * `name`. The options live in a portal, so they are resolved against the page.
 */
export async function selectOption(
  page: Page,
  trigger: Locator,
  name: string | RegExp,
  timeout = 20_000,
): Promise<void> {
  await clickRevealing(trigger, page.getByRole('option', { name }), timeout);
}

/**
 * Turns a switch (`role="switch"`) on, retrying the click until it actually
 * flips (same hydration race as the helpers above).
 */
export async function checkSwitch(sw: Locator, timeout = 15_000): Promise<void> {
  await expect(async () => {
    const isChecked = await sw.isChecked().catch(() => false);
    if (!isChecked) {
      await sw.click({ timeout: 5_000 });
    }
    await expect(sw).toBeChecked({ timeout: 3_000 });
  }).toPass({ timeout });
}
