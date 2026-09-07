import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import type { SettingsRepository } from '../repositories/settings.repository';
import { buildDefaultOrgSettings } from '@workspace/shared';

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

    async createOrganization(data: Omit<NewDbOrganization, 'id'>) {
      if (!data.name) throw new Error('El nombre de la organización es requerido');
      // La zona horaria es OBLIGATORIA desde la creación (no hay default silencioso).
      if (!data.timezone || !data.timezone.trim()) {
        throw new Error('La zona horaria es requerida');
      }

      const slug = data.slug || this.generateSlug(data.name);

      const existing = await orgsRepo.findBySlug(slug);
      if (existing) {
        throw new Error('El slug o subdominio ya está en uso por otra organización');
      }

      const newOrgData: NewDbOrganization = {
        ...data,
        id: crypto.randomUUID(),
        slug,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await orgsRepo.create(newOrgData);
      if (!created) {
        throw new Error('Error al crear la organización');
      }

      // Sembrar settings de la org (moneda principal, monedas activas, formato,
      // métodos de pago) para que la UI no caiga en fallbacks silenciosos.
      const defaults = buildDefaultOrgSettings(data.countryCode);
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
