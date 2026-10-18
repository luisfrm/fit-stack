/**
 * Primary currency selection and updates (RD-146).
 *
 * Contract:
 * - Console (`POST /api/platform/organizations`) preselects the country
 *   currency but accepts an explicit `primaryCurrency`; `active_currencies` is
 *   seeded with BOTH the chosen primary and the country currency, so a VE gym
 *   billing in USD starts with `["USD","VES"]`.
 * - An explicit `active_currencies` list must already contain the primary;
 *   otherwise `400 PRIMARY_CURRENCY_NOT_ACTIVE` with no organization written.
 * - A currency outside `COUNTRIES` answers `400 UNSUPPORTED_CURRENCY`.
 * - Updates (`PATCH /api/platform/organizations/:id` and tenant
 *   `PATCH /api/organizations/profile`) accept `primaryCurrency` only while it
 *   belongs to the stored `active_currencies`; `countryCode` stays immutable.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaReady,
  readGymSetting,
  skipReason,
  testQuery,
  truncateAll,
} from '../helpers/db';
import {
  createGymTenant,
  registerPlatformUser,
  uid,
} from '../helpers/auth';

describe.skipIf(skipReason !== null)('Organizations primary currency', () => {
  let admin: Awaited<ReturnType<typeof registerPlatformUser>>;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    admin = await registerPlatformUser('admin');
  });

  function orgPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `Gym ${uid()}`,
      slug: `gym-${uid()}`,
      countryCode: 'VE',
      timezone: 'America/Caracas',
      ...overrides,
    };
  }

  async function readPrimaryCurrency(organizationId: string): Promise<string> {
    const rows = await testQuery<{ primary_currency: string }>(
      `SELECT primary_currency FROM organization WHERE id = $1`,
      [organizationId],
    );
    return rows[0]!.primary_currency;
  }

  async function readActiveCurrencies(organizationId: string): Promise<string[]> {
    const raw = await readGymSetting(organizationId, 'active_currencies');
    return raw === undefined ? [] : (JSON.parse(raw) as string[]);
  }

  it('VE + USD: creates the org with both USD and VES active', async () => {
    const payload = orgPayload({ primaryCurrency: 'USD' });
    const res = await admin.client.post('/api/platform/organizations', payload);

    expect(res.status, res.text).toBe(201);
    expect(res.body.primaryCurrency).toBe('USD');
    expect(await readPrimaryCurrency(res.body.id)).toBe('USD');
    expect(await readActiveCurrencies(res.body.id)).toEqual(['USD', 'VES']);
  });

  it('defaults to the country currency when primaryCurrency is absent', async () => {
    const res = await admin.client.post('/api/platform/organizations', orgPayload());

    expect(res.status, res.text).toBe(201);
    expect(res.body.primaryCurrency).toBe('VES');
    expect(await readActiveCurrencies(res.body.id)).toEqual(['VES', 'USD']);
  });

  it('an explicit active list is normalized to include the country currency', async () => {
    const res = await admin.client.post(
      '/api/platform/organizations',
      orgPayload({
        primaryCurrency: 'USD',
        settings: { active_currencies: JSON.stringify(['USD']) },
      }),
    );

    expect(res.status, res.text).toBe(201);
    expect(await readActiveCurrencies(res.body.id)).toEqual(['USD', 'VES']);
  });

  it('rejects a primary outside the explicit active list without writing the org', async () => {
    const payload = orgPayload({
      primaryCurrency: 'USD',
      settings: { active_currencies: JSON.stringify(['VES']) },
    });
    const res = await admin.client.post('/api/platform/organizations', payload);

    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'PRIMARY_CURRENCY_NOT_ACTIVE',
      fields: ['primaryCurrency'],
    });

    const rows = await testQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM organization WHERE slug = $1`,
      [payload.slug],
    );
    expect(rows[0]?.count).toBe('0');
  });

  it('rejects an unsupported currency code without writing the org', async () => {
    const payload = orgPayload({ primaryCurrency: 'XXX' });
    const res = await admin.client.post('/api/platform/organizations', payload);

    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'UNSUPPORTED_CURRENCY',
      fields: ['primaryCurrency'],
    });

    const rows = await testQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM organization WHERE slug = $1`,
      [payload.slug],
    );
    expect(rows[0]?.count).toBe('0');
  });

  it('updates the primary to another active currency and persists it', async () => {
    const created = await admin.client.post(
      '/api/platform/organizations',
      orgPayload({
        primaryCurrency: 'VES',
        settings: { active_currencies: JSON.stringify(['VES', 'USD']) },
      }),
    );
    expect(created.status, created.text).toBe(201);

    const res = await admin.client.patch(
      `/api/platform/organizations/${created.body.id}`,
      { primaryCurrency: 'USD' },
    );
    expect(res.status, res.text).toBe(200);
    expect(res.body.primaryCurrency).toBe('USD');
    expect(await readPrimaryCurrency(created.body.id)).toBe('USD');
  });

  it('rejects a primary outside the stored active list, leaving the row unchanged', async () => {
    const created = await admin.client.post(
      '/api/platform/organizations',
      orgPayload({ primaryCurrency: 'USD' }),
    );
    expect(created.status, created.text).toBe(201);

    const res = await admin.client.patch(
      `/api/platform/organizations/${created.body.id}`,
      { primaryCurrency: 'PEN' },
    );
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'PRIMARY_CURRENCY_NOT_ACTIVE',
      fields: ['primaryCurrency'],
    });
    expect(await readPrimaryCurrency(created.body.id)).toBe('USD');
  });

  it('rejects a primary change when the organization has no active currencies', async () => {
    const { organization } = await createGymTenant('currency-no-settings');

    const res = await admin.client.patch(
      `/api/platform/organizations/${organization.id}`,
      { primaryCurrency: 'USD' },
    );
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'ACTIVE_CURRENCIES_NOT_CONFIGURED' });
    expect(await readPrimaryCurrency(organization.id)).toBe('VES');
  });

  it('tenant profile edits primaryCurrency inside active_currencies', async () => {
    const { owner, organization } = await createGymTenant('currency-tenant');
    const settings = await owner.client.post('/api/settings', {
      active_currencies: JSON.stringify(['VES', 'USD']),
    });
    expect(settings.status, settings.text).toBe(200);

    const res = await owner.client.patch('/api/organizations/profile', {
      primaryCurrency: 'USD',
    });
    expect(res.status, res.text).toBe(200);
    expect(await readPrimaryCurrency(organization.id)).toBe('USD');
  });

  it('tenant profile rejects a primary outside active_currencies and country changes', async () => {
    const { owner, organization } = await createGymTenant('currency-tenant-reject');
    const settings = await owner.client.post('/api/settings', {
      active_currencies: JSON.stringify(['VES', 'USD']),
    });
    expect(settings.status, settings.text).toBe(200);

    const invalid = await owner.client.patch('/api/organizations/profile', {
      primaryCurrency: 'PEN',
    });
    expect(invalid.status, invalid.text).toBe(400);
    expect(invalid.body).toMatchObject({
      code: 'PRIMARY_CURRENCY_NOT_ACTIVE',
      fields: ['primaryCurrency'],
    });

    const country = await owner.client.patch('/api/organizations/profile', {
      countryCode: 'PE',
    });
    expect(country.status, country.text).toBe(400);
    expect(country.body).toMatchObject({ code: 'IMMUTABLE_FIELD' });

    expect(await readPrimaryCurrency(organization.id)).toBe('VES');
  });

  it('platform GET responses include the organization settings', async () => {
    const created = await admin.client.post(
      '/api/platform/organizations',
      orgPayload({ primaryCurrency: 'USD' }),
    );
    expect(created.status, created.text).toBe(201);

    const byId = await admin.client.get(
      `/api/platform/organizations/${created.body.id}`,
    );
    expect(byId.status, byId.text).toBe(200);
    expect(byId.body.settings.active_currencies).toBe(
      JSON.stringify(['USD', 'VES']),
    );

    const bySlug = await admin.client.get(
      `/api/platform/organizations/by-slug/${created.body.slug}`,
    );
    expect(bySlug.status, bySlug.text).toBe(200);
    expect(bySlug.body.primaryCurrency).toBe('USD');
    expect(bySlug.body.settings.active_currencies).toBe(
      JSON.stringify(['USD', 'VES']),
    );
  });
});

