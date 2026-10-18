import { HTTPException } from 'hono/http-exception';
import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import type { SettingsRepository } from '../repositories/settings.repository';
import {
  buildDefaultOrgSettings,
  findFiscalWriteViolation,
  primaryCurrencyForCountry,
  StoredFiscalConfigSchema,
} from '@workspace/shared';
import type { FiscalConfig } from '@workspace/shared';

const slugTakenError = (message: string) =>
  new HTTPException(409, {
    message,
    res: new Response(JSON.stringify({ error: message, code: 'SLUG_TAKEN' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }),
  });

/**
 * Explicit 400 for fiscal invariant: override can only REDUCE
 * fiscal burden. Validates the MERGED config (an incoming partial does not know
 * the stored `isFormalTaxpayer`) and always before persisting.
 */
const FISCAL_VIOLATION_MESSAGES: Record<string, string> = {
  TAXES_REQUIRE_FORMAL_TAXPAYER:
    'Para activar impuestos primero debes declarar el negocio como contribuyente formal.',
  TAX_REQUIRES_CONFIRMATION:
    'Ese impuesto es condicional: exige confirmar la tasa vigente con tu contador antes de activarlo.',
};

const fiscalViolationError = (violation: {
  code: string;
  taxName?: string;
}) => {
  const message =
    FISCAL_VIOLATION_MESSAGES[violation.code] ?? 'Configuración fiscal inválida.';
  return new HTTPException(400, {
    message,
    res: new Response(
      JSON.stringify({ error: message, code: violation.code, tax: violation.taxName }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ),
  });
};

/**
 * Merge baseline: stored config may originate from an earlier version with
 * extra keys (when schema was lax) or from a future field. Parsed with a
 * tolerant schema (`.strip()`, not `.strict()`) so as NOT to lose `taxes`,
 * `disclaimerOverride`, or `isFormalTaxpayer` on an unknown key.
 */
function parseStoredFiscalConfig(stored: unknown): FiscalConfig {
  if (stored == null) return {};
  const parsed = StoredFiscalConfigSchema.safeParse(stored);
  if (!parsed.success) {
    console.error('Stored fiscalConfig invalid, ignored as merge base.');
    return {};
  }
  return parsed.data;
}

/**
 * Merges incoming `fiscalConfig` over existing (merge, not blind replace):
 * present scalars replace; `taxes[]` merges by `name` (override updates rate/enabled;
 * unknown names preserved as-is — resolver ignores them) and `confirmedTaxes[]` accumulates
 * (a confirmation is not lost on a partial PATCH of another field; revoking it means turning
 * off the tax). Explicit `null` = reset to defaults.
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
  if (incoming.confirmedTaxes !== undefined) {
    merged.confirmedTaxes = [
      ...new Set([...(base.confirmedTaxes ?? []), ...incoming.confirmedTaxes]),
    ];
  }

  if (incoming.taxes !== undefined) {
    const byName = new Map((base.taxes ?? []).map((t) => [t.name, t]));
    for (const override of incoming.taxes) {
      byName.set(override.name, override);
    }
    merged.taxes = [...byName.values()];
  }

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

      // Everything required goes into the same insert: currency derives from country,
      // format is explicit (or 'latam' as write default).
      const { currencyFormat, settings, ...rest } = data;
      const primaryCurrency = primaryCurrencyForCountry(data.countryCode);
      const newOrgData: NewDbOrganization = {
        ...rest,
        id: crypto.randomUUID(),
        slug,
        primaryCurrency,
        currencyFormat: currencyFormat ?? 'latam',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Fail-closed on creation: an org cannot be born asserting
      // taxes that its issuer never declared.
      const createViolation = findFiscalWriteViolation(
        data.countryCode,
        data.fiscalConfig as FiscalConfig | null | undefined,
      );
      if (createViolation) throw fiscalViolationError(createViolation);

      const created = await orgsRepo.create(newOrgData);
      if (!created) {
        throw new Error('Error al crear la organización');
      }

      // Only extensible settings seeded in gym_setting ({...defaults, ...rest}).
      const defaults = { ...buildDefaultOrgSettings(data.countryCode), ...settings };
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

      // Changing country recalculates primary currency (locked to country).
      if (data.countryCode) {
        (data as Partial<NewDbOrganization>).primaryCurrency = primaryCurrencyForCountry(data.countryCode);
      }

      // `fiscalConfig` (jsonb) merges over stored, never blind replacement:
      // partial PATCH of `taxes[]` must not drop `disclaimerOverride` or `isFormalTaxpayer`.
      if ('fiscalConfig' in data) {
        const incoming = data.fiscalConfig as FiscalConfig | null | undefined;
        if (incoming !== undefined) {
          const merged = mergeFiscalConfig(current.fiscalConfig, incoming);
          // Validates RESULT of merge, not incoming body.
          // If the same PATCH changes country, validates against the new country
          // (conditionals are country-scoped).
          const violation = findFiscalWriteViolation(
            data.countryCode ?? current.countryCode,
            merged,
          );
          if (violation) throw fiscalViolationError(violation);
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
