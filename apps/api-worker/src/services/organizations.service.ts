import { HTTPException } from 'hono/http-exception';
import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import type { SettingsRepository } from '../repositories/settings.repository';
import {
  COUNTRY_INDEX,
  buildDefaultOrgSettings,
  parseStoredFiscalConfig,
  primaryCurrencyForCountry,
} from '@workspace/shared';
import type { FiscalConfig } from '@workspace/shared';

/** `gym_setting` key holding the JSON list of currencies the org can charge in. */
export const ACTIVE_CURRENCIES_SETTING = 'active_currencies';

const slugTakenError = (message: string) =>
  new HTTPException(409, {
    message,
    res: new Response(JSON.stringify({ error: message, code: 'SLUG_TAKEN' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
  });

/**
 * Explicit 400: the currency is outside the supported universe
 * (`COUNTRY_INDEX.currencies`, derived from `COUNTRIES`). Never a silent
 * default: an unknown primary currency is a visible configuration error.
 */
const unsupportedCurrencyError = (currency: string) => {
  const message = `La moneda principal "${currency}" no está soportada.`;
  return new HTTPException(400, {
    message,
    res: new Response(
      JSON.stringify({
        error: message,
        code: 'UNSUPPORTED_CURRENCY',
        fields: ['primaryCurrency'],
        supportedCurrencies: COUNTRY_INDEX.currencies,
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
};

/**
 * Explicit 400: the organization has no valid `active_currencies` row. The
 * list is the authority for which currencies the org may charge in, so an
 * absent/malformed value can never be guessed (no fallback).
 */
const activeCurrenciesNotConfiguredError = () => {
  const message =
    'La organización no tiene monedas activas válidas configuradas; define las monedas activas antes de cambiar la moneda principal.';
  return new HTTPException(400, {
    message,
    res: new Response(
      JSON.stringify({ error: message, code: 'ACTIVE_CURRENCIES_NOT_CONFIGURED', fields: ['active_currencies'] }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
};

/** Explicit 400: the chosen primary must be one of the organization's active currencies. */
const primaryCurrencyNotActiveError = (currency: string, active: string[]) => {
  const message = `La moneda principal "${currency}" no está entre las monedas activas de la organización (${active.join(', ')}).`;
  return new HTTPException(400, {
    message,
    res: new Response(
      JSON.stringify({
        error: message,
        code: 'PRIMARY_CURRENCY_NOT_ACTIVE',
        fields: ['primaryCurrency'],
        activeCurrencies: active,
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
};

/** Validates the currency against the `COUNTRIES` universe (visible 400 otherwise). */
export function assertSupportedCurrency(currency: string): void {
  if (!COUNTRY_INDEX.currencies.includes(currency)) {
    throw unsupportedCurrencyError(currency);
  }
}

/**
 * Parses a stored `active_currencies` value (JSON array of currency codes).
 * `undefined` (row absent) → `null`; malformed JSON or invalid entries → the
 * explicit configuration error (never an empty list that silently widens).
 */
export function parseActiveCurrencies(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((code) => typeof code === 'string' && code.trim().length > 0)
    ) {
      return parsed;
    }
  } catch {
    // Falls through to the explicit error below.
  }
  throw activeCurrenciesNotConfiguredError();
}

function assertPrimaryCurrencyActive(currency: string, active: string[]): void {
  if (!active.includes(currency)) {
    throw primaryCurrencyNotActiveError(currency, active);
  }
}

/** Issuer identity columns that must be complete before declaring the org a formal taxpayer. */
const FISCAL_IDENTITY_FIELDS = ['legalName', 'taxId', 'address'] as const;

type FiscalIdentityField = (typeof FISCAL_IDENTITY_FIELDS)[number];

type FiscalIdentitySource = Partial<Record<FiscalIdentityField, string | null>>;

/** Missing (empty or whitespace-only) fiscal identity fields, in contract order. */
function missingFiscalIdentity(source: FiscalIdentitySource): FiscalIdentityField[] {
  return FISCAL_IDENTITY_FIELDS.filter((field) => !source[field]?.trim());
}

/**
 * Explicit 400 for the platform-only activation: `isFormalTaxpayer` can only
 * be turned on with a complete issuer identity (`legalName` + `taxId` +
 * `address`). Never a partial write: the whole update is rejected.
 */
const fiscalIdentityIncompleteError = (missing: FiscalIdentityField[]) => {
  const message =
    'Completa la identidad fiscal (nombre de registro, número de registro y dirección) antes de activar el contribuyente formal.';
  return new HTTPException(400, {
    message,
    res: new Response(
      JSON.stringify({ error: message, code: 'FISCAL_IDENTITY_INCOMPLETE', fields: missing }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
};

/** Rejects the activation unless the (already merged) fiscal identity is complete. */
function assertFiscalActivationAllowed(identity: FiscalIdentitySource): void {
  const missing = missingFiscalIdentity(identity);
  if (missing.length > 0) throw fiscalIdentityIncompleteError(missing);
}

/**
 * Merges incoming `fiscalConfig` over existing (merge, not blind replace):
 * present scalars replace, untouched ones are preserved (a partial PATCH of
 * `disclaimerOverride` must not drop `isFormalTaxpayer`). Explicit `null` =
 * reset to country defaults. Taxes are NOT part of this contract anymore:
 * they come from `COUNTRIES` (SSOT). The stored baseline is parsed with the
 * tolerant shared parser (legacy keys dropped, never a merge crash).
 */
export function mergeFiscalConfig(
  current: unknown,
  incoming: FiscalConfig | null,
): FiscalConfig | null {
  if (incoming === null) return null;
  const base = parseStoredFiscalConfig(current);

  const merged: FiscalConfig = { ...base };
  if (incoming.documentLabel !== undefined) merged.documentLabel = incoming.documentLabel;
  if (incoming.disclaimerOverride !== undefined) merged.disclaimerOverride = incoming.disclaimerOverride;
  if (incoming.isFormalTaxpayer !== undefined) merged.isFormalTaxpayer = incoming.isFormalTaxpayer;

  return merged;
}

export function createOrganizationsService(orgsRepo: OrganizationsRepository, settingsRepo: SettingsRepository) {
  return {
    async getAllOrganizations(filters: OrganizationFilter) {
      return orgsRepo.findAll(filters);
    },

    async getOrganizationById(id: string) {
      const org = await orgsRepo.findById(id);
      if (!org) {
        throw new Error('Organización no encontrada');
      }
      return org;
    },

    /** Like `getOrganizationById` but returns `null` instead of throwing. */
    async findOrganizationById(id: string) {
      return orgsRepo.findById(id);
    },

    /** Resolves an organization by slug. `null` if it does not exist. */
    async findOrganizationBySlug(slug: string, opts?: { includeMemberCount?: boolean }) {
      return orgsRepo.findBySlug(slug, opts);
    },

    async createOrganization(data: Omit<NewDbOrganization, 'id'> & { currencyFormat?: 'latam' | 'usa'; settings?: Record<string, string> }) {
      if (!data.name) throw new Error('El nombre de la organización es requerido');
      // Required from creation time, no silent defaults on read.
      if (!data.timezone?.trim()) {
        throw new Error('La zona horaria es requerida');
      }
      if (!data.countryCode?.trim()) {
        throw new Error('El país de operación es requerido');
      }

      const slug = (data as { slug?: string }).slug || this.generateSlug(data.name);

      const existing = await orgsRepo.findBySlug(slug);
      if (existing) {
        throw slugTakenError('El slug o subdominio ya está en uso por otra organización');
      }

      // Primary currency is explicit: Console preselects the country currency
      // but the operator may choose another supported one (e.g. USD in VE).
      // Absent → derived from the country (creation only); unknown → 400.
      const countryCurrency = primaryCurrencyForCountry(data.countryCode);
      const requestedPrimary = data.primaryCurrency ?? countryCurrency;
      assertSupportedCurrency(requestedPrimary);

      // Explicit active currencies (Console form) must already contain the
      // primary: a primary outside the active list is an explicit error, never
      // an implicit widening.
      const explicitActive =
        data.settings?.active_currencies !== undefined
          ? parseActiveCurrencies(data.settings.active_currencies)
          : null;
      if (explicitActive) assertPrimaryCurrencyActive(requestedPrimary, explicitActive);

      // Everything required goes into the same insert: currency derives from country,
      // format is explicit (or 'latam' as write default).
      const { currencyFormat, settings, ...rest } = data;
      const newOrgData: NewDbOrganization = {
        ...rest,
        id: crypto.randomUUID(),
        slug,
        primaryCurrency: requestedPrimary,
        currencyFormat: currencyFormat ?? 'latam',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Fail-closed on creation: a formal taxpayer is only accepted with a
      // complete issuer identity (same rule as any later activation).
      const createFiscal = data.fiscalConfig as FiscalConfig | null | undefined;
      if (createFiscal?.isFormalTaxpayer === true) {
        assertFiscalActivationAllowed({
          legalName: data.legalName,
          taxId: data.taxId,
          address: data.address,
        });
      }

      const created = await orgsRepo.create(newOrgData);
      if (!created) {
        throw new Error('Error al crear la organización');
      }

      // Only extensible settings seeded in gym_setting ({...defaults, ...rest}).
      // The active list always keeps BOTH the chosen primary and the country
      // currency (cross-currency org, e.g. USD primary in VE → USD + VES).
      const defaults = { ...buildDefaultOrgSettings(data.countryCode, requestedPrimary), ...settings };
      if (explicitActive) {
        defaults.active_currencies = JSON.stringify(
          Array.from(new Set([...explicitActive, countryCurrency])),
        );
      }
      for (const [key, value] of Object.entries(defaults)) {
        await settingsRepo.upsert(created.id, key, value);
      }

      return created;
    },

    async updateOrganization(id: string, data: Partial<NewDbOrganization>) {
      const current = await this.getOrganizationById(id);

      if (data.slug) {
        const existing = await orgsRepo.findBySlug(data.slug);
        if (existing && existing.id !== id) {
          throw slugTakenError('El slug ya está en uso por otra organización');
        }
      }

      // Primary currency is editable, but only within the organization's active
      // currencies (`gym_setting.active_currencies` is the authority). All
      // validation happens BEFORE the single update statement: no partial write.
      // Unchanged value is an idempotent no-op (no re-validation of legacy rows).
      if (
        data.primaryCurrency !== undefined &&
        data.primaryCurrency !== current.primaryCurrency
      ) {
        assertSupportedCurrency(data.primaryCurrency);
        const storedActive = await settingsRepo.findByKey(id, ACTIVE_CURRENCIES_SETTING);
        const active = parseActiveCurrencies(storedActive);
        if (!active) throw activeCurrenciesNotConfiguredError();
        assertPrimaryCurrencyActive(data.primaryCurrency, active);
      }

      // Country and primary currency are INDEPENDENT settings now: changing the
      // country never rewrites the primary silently (the currency is explicit).

      // `fiscalConfig` (jsonb) merges over stored, never blind replacement:
      // partial PATCH of `disclaimerOverride` must not drop `isFormalTaxpayer`.
      if ('fiscalConfig' in data) {
        const incoming = data.fiscalConfig as FiscalConfig | null | undefined;
        if (incoming !== undefined) {
          const merged = mergeFiscalConfig(current.fiscalConfig, incoming);
          // Platform-only activation still requires a complete issuer identity,
          // validated on the RESULT of the merge: the same PATCH may complete
          // the identity and the declaration together. No partial write.
          if (merged?.isFormalTaxpayer === true) {
            assertFiscalActivationAllowed({
              legalName: 'legalName' in data ? data.legalName : current.legalName,
              taxId: 'taxId' in data ? data.taxId : current.taxId,
              address: 'address' in data ? data.address : current.address,
            });
          }
          (data as { fiscalConfig?: FiscalConfig | null }).fiscalConfig = merged;
        }
      }

      return orgsRepo.update(id, data);
    },

    async deleteOrganization(id: string) {
      await this.getOrganizationById(id);
      await orgsRepo.delete(id);
    },

    generateSlug(text: string): string {
      return text
        .toString()
        .toLowerCase()
        .trim()
        .replaceAll(/\s+/g, '-')
        .replaceAll(/[^\w-]+/g, '')
        .replaceAll(/--+/g, '-');
    },
  };
}

export type OrganizationsService = ReturnType<typeof createOrganizationsService>;
