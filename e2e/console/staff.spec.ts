import { test, expect } from "@playwright/test";

test.describe("Console — Staff", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/staff", { waitUntil: "domcontentloaded" });
  });

  test("displays staff page with table and side panel", async ({ page }) => {
    await expect(page.locator("h1").filter({ hasText: "Staff" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#staff-table")).toBeVisible({
      timeout: 10_000,
    });
    // The setup user is promoted to owner via DB, so at least one row exists.
    // (No se aserta por badge de rol: con paginación, la fila del owner
    // puede quedar fuera de la página 1 según los datos del entorno.)
    await expect(page.locator("#staff-table tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });
    // Owner can manage other members: change-role and revoke actions visible.
    await expect(
      page
        .locator("#staff-table")
        .getByRole("button", { name: "Cambiar rol" })
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#staff-side-team")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#staff-side-security")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("filters by role through the URL", async ({ page }) => {
    await expect(page.locator("#staff-table")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Soporte", exact: true }).click();
    await expect(page).toHaveURL(/role=support/, { timeout: 10_000 });
    await expect(page.locator("#staff-table")).toBeVisible();
    // Toggle off clears the filter.
    await page.getByRole("button", { name: "Soporte", exact: true }).click();
    await expect(page).not.toHaveURL(/role=support/, { timeout: 10_000 });
  });

  test("searches by name or email through the URL", async ({ page }) => {
    await expect(page.locator("#staff-table")).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByPlaceholder("Buscar por nombre o email...")
      .fill("e2e.test");
    await expect(page).toHaveURL(/search=e2e\.test/, { timeout: 10_000 });
    await expect(page.locator("#staff-table")).toBeVisible();
  });
});
