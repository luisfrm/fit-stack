import { test, expect } from "@playwright/test";

test.describe("Console — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  });

  test("displays dashboard page", async ({ page }) => {
    await expect(
      page.locator("h1").filter({ hasText: "SaaS Platform Admin" }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows platform stats", async ({ page }) => {
    await expect(page.getByText("Total Gimnasios")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Miembros Globales")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Ingresos B2B")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Estado Sistema")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows the four dashboard widgets", async ({ page }) => {
    await expect(page.locator("#dashboard-renewals")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#dashboard-payments-review")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#dashboard-trials")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#dashboard-new-orgs")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("each widget has its own pagination footer", async ({ page }) => {
    await expect(page.locator("#dashboard-renewals")).toBeVisible({
      timeout: 20_000,
    });
    for (const widget of [
      "renewals",
      "payments-review",
      "trials",
      "new-orgs",
    ]) {
      await expect(
        page.locator(`#dashboard-${widget}-pagination`),
      ).toBeVisible();
      await expect(
        page.locator(`#dashboard-${widget}-pagination-label`),
      ).toContainText(/Página \d+ de \d+/);
    }
  });

  test("trials widget can switch between expiring and all", async ({
    page,
  }) => {
    await expect(page.locator("#dashboard-trials")).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("#dashboard-trials-filter-all").click();
    await expect(
      page.locator("#dashboard-trials-pagination-label"),
    ).toContainText(/Página 1 de \d+/);
    await page.locator("#dashboard-trials-filter-expiring").click();
    await expect(
      page.locator("#dashboard-trials-pagination-label"),
    ).toContainText(/Página 1 de \d+/);
  });

  test("has working sidebar navigation", async ({ page }) => {
    const sidebar = page.locator("nav").first();
    await expect(sidebar).toBeVisible();

    await expect(
      page
        .locator("nav")
        .getByRole("link", { name: "Organizaciones", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("nav").getByRole("link", { name: "Suscripciones" }),
    ).toBeVisible();
    await expect(
      page.locator("nav").getByRole("link", { name: "Planes" }),
    ).toBeVisible();
    await expect(
      page.locator("nav").getByRole("link", { name: "Staff" }),
    ).toBeVisible();
    await expect(
      page.locator("nav").getByRole("link", { name: "Configuración" }),
    ).toBeVisible();
  });
});
