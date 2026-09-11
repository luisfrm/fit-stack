import { test, expect } from '@playwright/test';
import { openModal } from '../helpers/modal';
import { navigateByClick } from '../helpers/nav';
import { SELECTORS } from '../helpers/selectors';

test.describe('Panel — Classes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/classes', { waitUntil: 'domcontentloaded' });
  });

  test('displays classes page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Gestión de Clases' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows create class button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nueva Clase' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('can open create class modal', async ({ page }) => {
    const modal = await openModal(page, page.getByRole('button', { name: 'Nueva Clase' }));
    await expect(modal).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar clase o entrenador...')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows week calendar with shareable week anchor', async ({ page }) => {
    await expect(page.locator(SELECTORS.classes.weekCalendar)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(SELECTORS.classes.weekLabel)).toBeVisible();
  });

  test('navigating weeks updates the week URL param', async ({ page }) => {
    await expect(page.locator(SELECTORS.classes.weekCalendar)).toBeVisible({
      timeout: 20_000,
    });
    const before = page.url();
    await navigateByClick(page, page.locator(SELECTORS.classes.weekNext), /week=/);
    expect(page.url()).toMatch(/week=\d{4}-\d{2}-\d{2}/);
    expect(page.url()).not.toBe(before);
    await expect(page.locator(SELECTORS.classes.weekCalendar)).toBeVisible();
  });

  test('shows next class and visibility summary', async ({ page }) => {
    await expect(page.locator(SELECTORS.classes.nextClass)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(SELECTORS.classes.visibilitySummary)).toContainText(/visibles/);
  });
});