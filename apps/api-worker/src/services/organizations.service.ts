import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import type { SettingsRepository } from '../repositories/settings.repository';
import { buildDefaultOrgSettings, primaryCurrencyForCountry } from '@workspace/shared';

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
        throw new Error('El slug o subdominio ya está en uso por otra organización');
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
      await this.getOrganizationById(id);

      if (data.slug) {
        const existing = await orgsRepo.findBySlug(data.slug);
        if (existing && existing.id !== id) {
          throw new Error('El slug ya está en uso por otra organización');
        }
      }

      // Cambiar de país recalcula la moneda principal (bloqueada al país).
      if (data.countryCode) {
        (data as Partial<NewDbOrganization>).primaryCurrency = primaryCurrencyForCountry(data.countryCode);
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
