/**
 * Console auth setup — creates a platform admin user (via API + direct DB
 * role promotion), logs in via UI and saves storageState.
 */
import { test as setup, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setUserPlatformRole } from './helpers/db';

const API_URL = process.env.API_BASE_URL || 'http://localhost:8788';
const email = process.env.E2E_USER_EMAIL ?? '';
const password = process.env.E2E_USER_PASSWORD ?? '';

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

const authDir = join(process.cwd(), 'e2e', '.auth');

/**
 * Creates a platform admin via API sign-up + direct DB role promotion.
 * The admin plugin's set-role endpoint requires an existing admin, so we
 * write to the DB directly (same approach as api-worker integration tests).
 */
async function createPlatformAdminViaApi(userEmail: string, userPassword: string) {
  const signUpRes = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': API_URL },
    body: JSON.stringify({ email: userEmail, password: userPassword, name: 'E2E Console Admin' }),
  });
  if (!signUpRes.ok) {
    throw new Error(`sign-up failed (${signUpRes.status}): ${await signUpRes.text()}`);
  }
  const data = await signUpRes.json();
  const userId = data?.user?.id;
  if (!userId) throw new Error(`sign-up returned no user id: ${JSON.stringify(data)}`);

  await setUserPlatformRole(userId, 'owner');
}

setup('authenticate as console user', async ({ page }) => {
  mkdirSync(authDir, { recursive: true });

  const userEmail = email || uniqueEmail('console');
  const userPassword = password || 'TestPassw0rd!E2E';

  if (!email) {
    await createPlatformAdminViaApi(userEmail, userPassword);
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill(userEmail);
  await page.locator('#password').fill(userPassword);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });

  await expect(page.locator('h1').filter({ hasText: 'SaaS Platform Admin' })).toBeVisible({
    timeout: 45_000,
  });

  await page.context().storageState({
    path: join(authDir, 'console-user.json'),
  });
});
