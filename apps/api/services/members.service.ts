import { membersRepository, MembersFilter, NewDbMember } from '../repositories/members.repository';
import { accessControlRepository } from '../repositories/access-control.repository';
import { tokenService } from './token.service';
import { emailService } from './email.service';
import { usersRepository } from '../repositories/users.repository';
import { auth } from '@/config/auth';
import { headers } from 'next/headers';

const sanitizeMemberData = <T extends Record<string, any>>(data: T): T => {
  const sanitized = { ...data };
  for (const key in sanitized) {
    if (sanitized[key] === "") {
      sanitized[key] = null as any;
    }
  }
  return sanitized;
};

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

  async getMemberByUserId(organizationId: string, userId: string) {
    return membersRepository.findByUserId(organizationId, userId);
  },

  async createMember(organizationId: string, data: Omit<NewDbMember, "organizationId">, sendInvite: boolean = false) {
    const sanitizedData = sanitizeMemberData(data);
    const existing = await membersRepository.findByEmail(organizationId, sanitizedData.email);
    if (existing) {
      throw new Error('El correo electrónico ya está registrado para otro miembro en esta organización');
    }

    const newMemberData: NewDbMember = {
      ...sanitizedData,
      organizationId,
    };

    const newMember = await membersRepository.create(newMemberData);

    if (!newMember) {
      throw new Error('Error al crear el miembro');
    }

    if (sendInvite) {
      // 1. Check if email already exists as a Better Auth user
      const existingUser = await usersRepository.findByEmail(sanitizedData.email);

      if (existingUser) {
        // Check if they are already a member of this organization
        const isAlreadyMember = await membersRepository.findAuthMember(existingUser.id, organizationId);

        if (isAlreadyMember) {
          // AUTO-LINK: They are already in the organization (e.g. they are the Owner)
          // We update the record we just created to include the userId
          await membersRepository.update(organizationId, newMember.id, { userId: existingUser.id });
        } else {
          // FLOW: Existing User -> Better Auth Organization Invitation
          try {
            await auth.api.createInvitation({
              headers: await headers(),
              body: {
                email: sanitizedData.email,
                role: (sanitizedData.role as any) || 'member',
                organizationId,
                resend: true,
              }
            });
          } catch (inviteError: any) {
            console.error("Failed to create Better Auth invitation:", inviteError);
          }
        }
      } else {
        // FLOW: New User -> JWT Token + Registration Email
        const token = await tokenService.signInviteToken(organizationId, newMember.id, newMember.email);
        await emailService.sendRegistrationInvite(newMember.email, token);
      }
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

    const sanitizedData = sanitizeMemberData(data);

    // If role is being updated, sync with auth system if user is linked
    if (sanitizedData.role) {
      const currentMember = await this.getMemberById(organizationId, id);
      if (currentMember.userId) {
        await membersRepository.updateAuthRole(currentMember.userId, organizationId, sanitizedData.role);
      }
    }

    const updated = await membersRepository.update(organizationId, id, sanitizedData);

    // Trigger biometric sync task if critical fields changed
    if (updated && (data.imageUrl || data.documentId || data.firstName || data.lastName)) {
      await accessControlRepository.createSyncTask(organizationId, id, 'enroll');
    }

    return updated;
  },

  async deleteMember(organizationId: string, id: number) {
    const member = await membersRepository.findById(organizationId, id);

    // Si el miembro tiene userId vinculado, revocar su acceso en Better Auth
    if (member?.userId) {
      await membersRepository.deleteAuthMember(member.userId, organizationId);
    }

    // Trigger biometric sync task to remove from hardware
    await accessControlRepository.createSyncTask(organizationId, id, 'delete');

    await membersRepository.delete(organizationId, id);
  },

  async resendInvite(organizationId: string, id: number) {
    const member = await this.getMemberById(organizationId, id);

    if (member.userId) {
      throw new Error('El usuario ya tiene una cuenta vinculada');
    }

    // Smart detection for resend
    const existingUser = await usersRepository.findByEmail(member.email);

    if (existingUser) {
      // Check if they are already a member of this organization
      const isAlreadyMember = await membersRepository.findAuthMember(existingUser.id, organizationId);

      if (isAlreadyMember) {
        // AUTO-LINK: Link them retrospectively if they were stuck with null userId
        await membersRepository.update(organizationId, member.id, { userId: existingUser.id });
        return { success: true, linked: true };
      }

      // Re-send Better Auth invitation
      await auth.api.createInvitation({
        headers: await headers(),
        body: {
          email: member.email,
          role: (member.authRole as any) || 'member',
          organizationId,
          resend: true,
        }
      });
    } else {
      // Re-send Registration Token
      const token = await tokenService.signInviteToken(organizationId, member.id, member.email);
      await emailService.sendRegistrationInvite(member.email, token);
    }

    return { success: true };
  }
};
