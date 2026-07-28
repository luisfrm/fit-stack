import type { OrganizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';

export function createOrganizationsService(orgsRepo: OrganizationsRepository) {
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

    async createOrganization(data: Omit<NewDbOrganization, 'id'>) {
      if (!data.name) throw new Error('El nombre de la organización es requerido');

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

      return orgsRepo.create(newOrgData);
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
