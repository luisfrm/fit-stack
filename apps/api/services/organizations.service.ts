import { organizationsRepository, OrganizationFilter, NewDbOrganization } from '../repositories/organizations.repository';
import { randomUUID } from 'node:crypto';

export const organizationsService = {
  async getAllOrganizations(filters: OrganizationFilter) {
    return organizationsRepository.findAll(filters);
  },

  async getOrganizationById(id: string) {
    const org = await organizationsRepository.findById(id);
    if (!org) {
      throw new Error('Organización no encontrada');
    }
    return org;
  },

  async createOrganization(data: Omit<NewDbOrganization, "id">) {
    // 1. Validar nombre
    if (!data.name) throw new Error('El nombre de la organización es requerido');

    // 2. Generar slug si no existe
    let slug = data.slug || this.generateSlug(data.name);

    // 3. Validar unicidad de slug
    const existing = await organizationsRepository.findBySlug(slug);
    if (existing) {
      throw new Error('El slug o subdominio ya está en uso por otra organización');
    }

    const newOrgData: NewDbOrganization = {
      ...data,
      id: randomUUID(), // ID único de plataforma
      slug,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return organizationsRepository.create(newOrgData);
  },

  async updateOrganization(id: string, data: Partial<NewDbOrganization>) {
    await this.getOrganizationById(id);

    if (data.slug) {
      const existing = await organizationsRepository.findBySlug(data.slug);
      if (existing && existing.id !== id) {
        throw new Error('El slug ya está en uso por otra organización');
      }
    }

    return organizationsRepository.update(id, data);
  },

  async deleteOrganization(id: string) {
    await this.getOrganizationById(id);
    await organizationsRepository.delete(id);
  },

  /**
   * Generates a URL-friendly slug from a string.
   */
  generateSlug(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replaceAll(/\s+/g, '-')     // Replazar espacios con -
      .replaceAll(/[^\w-]+/g, '')  // Eliminar caracteres no-word
      .replaceAll(/--+/g, '-');    // Reemplazar múltiples - por uno solo
  }
};
