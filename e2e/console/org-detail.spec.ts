import { test, expect } from "@playwright/test";
import { SELECTORS } from "../helpers/selectors";
import { API_BASE_URL } from "../helpers/api";

const DETAIL = SELECTORS.consoleOrgDetail;

test.describe("Console — Organization detail", () => {
  let slug: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/console-user.json",
    });
    slug = `e2e-profile-${Date.now()}`;
    const res = await context.request.post(
      `${API_BASE_URL}/api/platform/organizations`,
      {
        data: {
          name: `E2E Profile ${slug}`,
          slug,
          countryCode: "VE",
          timezone: "America/Caracas",
        },
      },
    );
    if (!res.ok())
      throw new Error(
        `org create failed (${res.status()}): ${await res.text()}`,
      );
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/organizations/${slug}`, {
      waitUntil: "domcontentloaded",
    });
  });

  test("displays the org profile with back button", async ({ page }) => {
    await expect(page.locator(DETAIL.backButton)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator("h1").filter({ hasText: "E2E Profile" }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows the four profile cards", async ({ page }) => {
    await expect(page.locator(DETAIL.planCard)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(DETAIL.membersCard)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(DETAIL.adoptionCard)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(DETAIL.billingCard)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows the org subscriptions table", async ({ page }) => {
    await expect(page.locator(DETAIL.subsTable)).toBeVisible({
      timeout: 20_000,
    });
  });
});
