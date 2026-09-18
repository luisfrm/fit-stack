import { HTTPException } from 'hono/http-exception';
import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import type { SettingsRepository } from '../repositories/settings.repository';
import {
  buildDefaultOrgSettings,
  findFiscalWriteViolation,
  primaryCurrencyForCountry,
  FiscalConfigSchema,
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
 * 400 explícito del invariante fiscal (D6): el override solo puede REDUCIR
 * carga fiscal. Se valida el config FUSIONADO (un parcial entrante no conoce
 * el `isFormalTaxpayer` almacenado) y siempre antes de persistir.
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
 * Base del merge: la almacenada puede venir de una versión previa con keys
 * extra (cuando el schema era laxo) o de un campo futuro. Se parsea con un
 * schema tolerante (`.strip()`, no el `.strict()`) para NO perder `taxes`,
 * `disclaimerOverride` ni `isFormalTaxpayer` por una key desconocida.
 */
function parseStoredFiscalConfig(stored: unknown): FiscalConfig {
  if (stored == null) return {};
  const parsed = StoredFiscalConfigSchema.safeParse(stored);
  if (!parsed.success) {
    console.error('fiscalConfig almacenada inválida, se ignora como base del merge.');
    return {};
  }
  return parsed.data;
}

/**
 * Fusiona el `fiscalConfig` entrante sobre el existente (merge, no reemplazo
 * ciego): los escalares presentes reemplazan; `taxes[]` se fusiona por
 * `name` (override actualiza rate/enabled; nombres desconocidos se conservan
 * tal cual — el resolver los ignora) y `confirmedTaxes[]` se acumula (una
 * confirmación no se pierde por un PATCH parcial de otro campo; revocarla es
 * apagar el impuesto). `null` explícito = reset a defaults.
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

    /** Resolve una organización por su slug. `null` si no existe. */
    async findOrganizationBySlug(slug: string, opts?: { includeMemberCount?: boolean }) {
      return orgsRepo.findBySlug(slug, opts);
    },

    async createOrganization(data: Omit<NewDbOrganization, 'id'> & { currencyFormat?: 'latam' | 'usa'; settings?: Record<string, string> }) {
      if (!data.name) throw new Error('El nombre de la organización es requerido');
      // Obligatorios desde la creación, sin defaults silenciosos en lectura.
      if (!data.timezone || !data.timezone.trim()) {
        throw new Error('La zona horaria es requerida');
      }
      if (!data.countryCode || !data.countryCode.trim()) {
        throw new Error('El país de operación es requerido');
      }

      const slug = (data as { slug?: string }).slug || this.generateSlug(data.name);

      const existing = await orgsRepo.findBySlug(slug);
      if (existing) {
        throw slugTakenError('El slug o subdominio ya está en uso por otra organización');
      }

      // Todo lo obligatorio va en el mismo insert: la moneda deriva del país,
      // el formato viene explícito (o 'latam' como default de escritura).
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

      // Fail-closed en la creación: una org no puede nacer afirmando
      // impuestos que su emisor no declaró.
      const createViolation = findFiscalWriteViolation(
        data.countryCode,
        data.fiscalConfig as FiscalConfig | null | undefined,
      );
      if (createViolation) throw fiscalViolationError(createViolation);

      const created = await orgsRepo.create(newOrgData);
      if (!created) {
        throw new Error('Error al crear la organización');
      }

      // Solo lo extensible se siembra en gym_setting ({...defaults, ...rest}).
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

      // Cambiar de país recalcula la moneda principal (bloqueada al país).
      if (data.countryCode) {
        (data as Partial<NewDbOrganization>).primaryCurrency = primaryCurrencyForCountry(data.countryCode);
      }

      // `fiscalConfig` (jsonb) se fusiona sobre la almacenada, nunca se
      // reemplaza a ciegas: un PATCH parcial de `taxes[]` no debe borrar
      // `disclaimerOverride` ni `isFormalTaxpayer`.
      if ('fiscalConfig' in data) {
        const incoming = data.fiscalConfig as FiscalConfig | null | undefined;
        if (incoming !== undefined) {
          const merged = mergeFiscalConfig(current.fiscalConfig, incoming);
          // Se valida el RESULTADO del merge, no el body entrante (D6).
          // Si el mismo PATCH cambia el país, se valida contra el nuevo
          // (los condicionales son por país).
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
