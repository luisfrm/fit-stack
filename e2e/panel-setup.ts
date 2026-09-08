/**
 * Panel auth setup — creates a gym tenant (user + organization),
 * logs in via UI, activates the org on the session and saves storageState.
 */
import { test as setup, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API_URL = process.env.API_BASE_URL || 'http://localhost:8788';
const email = process.env.E2E_USER_EMAIL ?? '';
const password = process.env.E2E_USER_PASSWORD ?? '';

function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

const authDir = join(process.cwd(), 'e2e', '.auth');

/** Extracts session cookies from a fetch Response (getSetCookie or fallback). */
function extractCookies(res: Response): string {
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter((v): v is string => Boolean(v));

  const jar = new Map<string, string>();
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value && !/expires=Thu, 01 Jan 1970/i.test(raw)) jar.set(name, value);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Full gym tenant via API: sign-up → create org → activate org.
 * Returns the org id so the setup can set it active on the browser session.
 */
async function createGymTenantViaApi(userEmail: string, userPassword: string) {
  const signUpRes = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': API_URL },
    body: JSON.stringify({ email: userEmail, password: userPassword, name: 'E2E Panel User' }),
  });
  if (!signUpRes.ok) {
    throw new Error(`sign-up failed (${signUpRes.status}): ${await signUpRes.text()}`);
  }
  const cookies = extractCookies(signUpRes);

  const slug = `gym-${randomUUID().slice(0, 8)}`;
  const orgRes = await fetch(`${API_URL}/api/auth/organization/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': API_URL, 'Cookie': cookies },
    body: JSON.stringify({
      name: `Gym ${slug}`,
      slug,
      countryCode: 'VE',
      timezone: 'America/Caracas',
      primaryCurrency: 'VES',
      currencyFormat: 'latam',
    }),
  });
  if (!orgRes.ok) {
    throw new Error(`organization create failed (${orgRes.status}): ${await orgRes.text()}`);
  }
  const orgData = await orgRes.json();
  const organizationId = orgData?.id ?? orgData?.organization?.id;
  if (!organizationId) throw new Error(`organization create returned no id: ${JSON.stringify(orgData)}`);

  const activeRes = await fetch(`${API_URL}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': API_URL, 'Cookie': cookies },
    body: JSON.stringify({ organizationId }),
  });
  if (!activeRes.ok) {
    throw new Error(`set-active failed (${activeRes.status}): ${await activeRes.text()}`);
  }

  return { organizationId };
}

setup('authenticate as panel user', async ({ page }) => {
  mkdirSync(authDir, { recursive: true });

  const userEmail = email || uniqueEmail('panel');
  const userPassword = password || 'TestPassw0rd!E2E';

  if (!email) {
    await createGymTenantViaApi(userEmail, userPassword);
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill(userEmail);
  await page.locator('#password').fill(userPassword);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });

  // Wait for the dashboard to actually render (org auto-activated or picker)
  await expect(page.locator('h1').filter({ hasText: 'Panel de Control' })).toBeVisible({
    timeout: 45_000,
  });

  await page.context().storageState({
    path: join(authDir, 'panel-user.json'),
  });
});
