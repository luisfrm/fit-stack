import { membersRepository, MembersFilter, NewDbMember } from '../repositories/members.repository';
import { accessControlRepository } from '../repositories/access-control.repository';
import { tokenService } from './token.service';
import { emailService } from './email.service';

export const membersService = {
  async getAllMembers(filters: MembersFilter) {
    if (!filters.organizationId) throw new Error("organizationId is required");
    return membersRepository.findAll(filters);
  },

  async getMemberById(organizationId: string, id: number) {
    const member = await membersRepository.findById(organizationId, id);
    if (!member) {
      throw new Error('Miembro no encontrado');
    }
    return member;
  },

  async createMember(organizationId: string, data: Omit<NewDbMember, "organizationId">, sendInvite: boolean = false) {
    const existing = await membersRepository.findByEmail(organizationId, data.email);
    if (existing) {
      throw new Error('El correo electrónico ya está registrado para otro miembro en esta organización');
    }

    const newMemberData: NewDbMember = {
      ...data,
      organizationId,
    };

    const newMember = await membersRepository.create(newMemberData);

    if (!newMember) {
      throw new Error('Error al crear el miembro');
    }

    if (sendInvite) {
      const token = await tokenService.signInviteToken(organizationId, newMember.id, newMember.email);
      await emailService.sendRegistrationInvite(newMember.email, token);
    }

    // Trigger biometric sync task if member has a photo
    if (newMember.imageUrl) {
      await accessControlRepository.createSyncTask(organizationId, newMember.id, 'enroll');
    }

    return newMember;
  },

  async updateMember(organizationId: string, id: number, data: Partial<NewDbMember>) {
    await this.getMemberById(organizationId, id);

    if (data.email) {
      const existing = await membersRepository.findByEmail(organizationId, data.email);
      if (existing && existing.id !== id) {
        throw new Error('El correo electrónico ya está en uso por otro miembro');
      }
    }

    const updated = await membersRepository.update(organizationId, id, data);

    // Trigger biometric sync task if critical fields changed
    if (updated && (data.imageUrl || data.documentId || data.firstName || data.lastName)) {
      await accessControlRepository.createSyncTask(organizationId, id, 'enroll');
    }

    return updated;
  },

  async deleteMember(organizationId: string, id: number) {
    const member = await this.getMemberById(organizationId, id);
    
    // Trigger biometric sync task to remove from hardware
    await accessControlRepository.createSyncTask(organizationId, id, 'delete');
    
    await membersRepository.delete(organizationId, id);
  },

  async resendInvite(organizationId: string, id: number) {
    const member = await this.getMemberById(organizationId, id);

    if (member.userId) {
      throw new Error('El usuario ya tiene una cuenta vinculada');
    }

    const token = await tokenService.signInviteToken(organizationId, member.id, member.email);
    await emailService.sendRegistrationInvite(member.email, token);

    return { success: true };
  }
};
