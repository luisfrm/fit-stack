import { test, expect } from "@playwright/test";
import { SELECTORS } from "../helpers/selectors";

const SUBS = SELECTORS.consoleSubscriptions;

test.describe("Console — Subscriptions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/subscriptions", { waitUntil: "domcontentloaded" });
  });

  test("displays subscriptions page", async ({ page }) => {
    await expect(
      page.locator("h1").filter({ hasText: "Suscripciones" }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows search input", async ({ page }) => {
    await expect(page.locator(SUBS.search)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("has status filter options", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Activas", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Trial", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Por Vencer", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Suspendidas", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows money KPIs and side panel", async ({ page }) => {
    await expect(page.locator(SUBS.kpiMrr)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(SUBS.kpiMonth)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(SUBS.kpiPrev)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(SUBS.panelExpiring)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(SUBS.panelRevenue)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders the table wrapper", async ({ page }) => {
    await expect(page.locator(SUBS.table)).toBeVisible({ timeout: 20_000 });
  });

  test("plan filter persists through the URL", async ({ page }) => {
    await expect(page.locator(SUBS.search)).toBeVisible({
      timeout: 20_000,
    });
    // No plan selected initially; selecting one writes ?planId= to the URL.
    const planSelect = page.getByText("Todos los planes");
    if (await planSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await planSelect.click();
      const firstOption = page.getByRole("option").first();
      if (await firstOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstOption.click();
        await expect(page).toHaveURL(/planId=\d+/, { timeout: 10_000 });
      }
    }
  });
});
