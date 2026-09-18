import { test, expect } from "@playwright/test";

test.describe("Console — Mobile nav", () => {
  test("mobile viewport shows hamburger header and sheet navigates", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const header = page.getByTestId("mobile-nav-header");
    await expect(header).toBeVisible({ timeout: 20_000 });

    // Desktop sidebar is hidden below lg
    await expect(page.locator("aside").first()).toBeHidden();

    const toggle = page.getByTestId("mobile-nav-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Abrir navegación");

    await toggle.click();
    const sheet = page.getByTestId("mobile-nav-sheet");
    await expect(sheet).toBeVisible();

    await sheet
      .getByRole("link", { name: "Organizaciones", exact: true })
      .click();
    await expect(page).toHaveURL(/\/organizations/, { timeout: 15_000 });
    // Sheet closes on navigation (pathname change)
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(header).toBeVisible();
  });

  test("mobile sheet closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const toggle = page.getByTestId("mobile-nav-toggle");
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await toggle.click();
    const sheet = page.getByTestId("mobile-nav-sheet");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });
  });

  test("desktop viewport shows sidebar and hides mobile header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("mobile-nav-header")).toBeHidden({
      timeout: 20_000,
    });
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Organizaciones", exact: true }),
    ).toBeVisible();
  });
});
