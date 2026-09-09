import { test, expect } from "@playwright/test";
import { SELECTORS } from "../helpers/selectors";
import { navigateByClick } from "../helpers/nav";

const ORGS = SELECTORS.consoleOrganizations;

test.describe("Console — Organizations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/organizations", { waitUntil: "domcontentloaded" });
  });

  test("displays organizations page", async ({ page }) => {
    await expect(
      page.locator("h1").filter({ hasText: "Organizaciones" }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows search input", async ({ page }) => {
    await expect(page.locator(ORGS.search)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows create organization button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "NUEVA ORGANIZACIÓN" }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows org KPIs and filters", async ({ page }) => {
    await expect(page.locator(ORGS.kpiTotal)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(ORGS.kpiNew)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(ORGS.kpiActive)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(ORGS.kpiNone)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(ORGS.countryFilter)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(ORGS.statusFilter)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("KPI filter navigates through the URL", async ({ page }) => {
    await expect(page.locator(ORGS.kpiActive)).toBeVisible({ timeout: 20_000 });
    await navigateByClick(
      page,
      page.locator(ORGS.kpiActive),
      /subStatus=active/,
    );
  });
});
