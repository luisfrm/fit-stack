import { membersRepository, MembersFilter, NewDbMember } from '../repositories/members.repository';
import { tokenService } from './token.service';
import { emailService } from './email.service';

export const membersService = {
  async getAllMembers(filters: MembersFilter) {
    return membersRepository.findAll(filters);
  },

  async getMemberById(id: number) {
    const member = await membersRepository.findById(id);
    if (!member) {
      throw new Error('Miembro no encontrado');
    }
    return member;
  },

  async createMember(data: NewDbMember, sendInvite: boolean = false) {
    const existing = await membersRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('El correo electrónico ya está registrado para otro miembro');
    }

    const newMember = await membersRepository.create(data);

    if (!newMember) {
      throw new Error('Error al crear el miembro');
    }

    if (sendInvite) {
      const token = await tokenService.signInviteToken(newMember.id, newMember.email);
      await emailService.sendRegistrationInvite(newMember.email, token);
    }

    return newMember;
  },

  async updateMember(id: number, data: Partial<NewDbMember>) {
    await this.getMemberById(id);

    if (data.email) {
      const existing = await membersRepository.findByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new Error('El correo electrónico ya está en uso por otro miembro');
      }
    }

    return membersRepository.update(id, data);
  },

  async deleteMember(id: number) {
    await this.getMemberById(id);
    await membersRepository.delete(id);
  },

  async resendInvite(id: number) {
    const member = await this.getMemberById(id);

    if (member.user) {
      throw new Error('El usuario ya tiene una cuenta vinculada');
    }

    const token = await tokenService.signInviteToken(member.id, member.email);
    await emailService.sendRegistrationInvite(member.email, token);

    return { success: true };
  }
};
