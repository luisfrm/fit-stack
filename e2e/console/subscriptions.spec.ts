import { expect, test } from "../fixtures";
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

  /**
   * RD-132 — no silent currency/format fallback: the money KPIs are rendered
   * with `formatCents(..., primary_currency, currency_format)` taken from the
   * platform settings, so both the currency code and the separator convention
   * must be the configured ones (never a hardcoded "USD"/"latam").
   *
   * The settings are NOT mutated here: the console caches
   * `GET /platform/settings` for 600s (`console:settings` tag) and the API
   * invalidates its own Redis cache on write, not Next's data cache — a
   * mutation would not be observable within the test without a
   * revalidation hook. The absence path (missing setting → visible error) is
   * covered by `apps/console/tests/unit/platform-settings.test.ts`.
   */
  test("money KPIs use the platform currency and format", async ({
    page,
    consoleApi,
  }) => {
    const settings = await consoleApi.get<Record<string, string>>(
      "/api/platform/settings",
    );
    const currency = settings["primary_currency"];
    const format = settings["currency_format"];
    expect(currency, "platform settings must be seeded (/api/init)").toBeTruthy();
    expect(["latam", "usa"]).toContain(format);

    await page.goto("/subscriptions", { waitUntil: "domcontentloaded" });
    const mrr = page.locator(SUBS.kpiMrr);
    await expect(mrr).toBeVisible({ timeout: 20_000 });

    const text = (await mrr.innerText()).replace(/\s+/g, " ");
    expect(text).toContain(currency as string);
    // latam → "1.250,50 EUR" · usa → "1,250.50 EUR"
    expect(text).toMatch(
      format === "usa" ? /\d\.\d{2} [A-Z]{3}/ : /\d,\d{2} [A-Z]{3}/,
    );
  });
});
