import type { MembersRepository, MembersFilter, NewDbMember } from '../repositories/members.repository';
import type { UsersRepository } from '../repositories/users.repository';
import type { TokenService } from './token.service';
import type { Auth } from '../lib/env';

const sanitizeMemberData = <T extends Record<string, any>>(data: T): T => {
  const sanitized = { ...data };
  for (const key in sanitized) {
    if (sanitized[key] === '') {
      sanitized[key] = null as any;
    }
  }
  return sanitized;
};

export function createMembersService(
  membersRepo: MembersRepository,
  usersRepo: UsersRepository,
  tokenService: TokenService,
  taskQueue?: Queue
) {
  return {
    async getAllMembers(filters: MembersFilter) {
      if (!filters.organizationId) throw new Error('organizationId is required');
      return membersRepo.findAll(filters);
    },

    async getMemberById(organizationId: string, id: number) {
      const member = await membersRepo.findById(organizationId, id);
      if (!member) {
        throw new Error('Miembro no encontrado');
      }
      return member;
    },

    async getMemberByUserId(organizationId: string, userId: string) {
      return membersRepo.findByUserId(organizationId, userId);
    },

    async createMember(
      organizationId: string,
      data: Omit<NewDbMember, 'organizationId'>,
      sendInvite: boolean = false,
      ctx?: { auth: Auth; headers: Headers }
    ) {
      const sanitizedData = sanitizeMemberData(data);
      const existing = await membersRepo.findByEmail(organizationId, sanitizedData.email);
      if (existing) {
        throw new Error('El correo electrónico ya está registrado para otro miembro en esta organización');
      }

      const newMemberData: NewDbMember = {
        ...sanitizedData,
        organizationId,
      };

      const newMember = await membersRepo.create(newMemberData);

      if (!newMember) {
        throw new Error('Error al crear el miembro');
      }

      if (sendInvite) {
        const existingUser = await usersRepo.findByEmail(sanitizedData.email);

        if (existingUser) {
          const isAlreadyMember = await membersRepo.findAuthMember(existingUser.id, organizationId);

          if (isAlreadyMember) {
            await membersRepo.update(organizationId, newMember.id, { userId: existingUser.id });
          } else if (ctx) {
            try {
              await (ctx.auth.api as any).createInvitation({
                headers: ctx.headers,
                body: {
                  email: sanitizedData.email,
                  role: (sanitizedData.role as any) || 'member',
                  organizationId,
                  resend: true,
                },
              });
            } catch (inviteError: any) {
              console.error('Failed to create Better Auth invitation:', inviteError);
            }
          }
        } else {
          const token = await tokenService.signInviteToken(organizationId, newMember.id, newMember.email);
          if (taskQueue) {
            await taskQueue.send({
              type: 'email.registration_invite',
              email: newMember.email,
              token,
            });
          }
        }
      }

      return newMember;
    },

    async updateMember(organizationId: string, id: number, data: Partial<NewDbMember>) {
      await this.getMemberById(organizationId, id);

      if (data.email) {
        const existing = await membersRepo.findByEmail(organizationId, data.email);
        if (existing && existing.id !== id) {
          throw new Error('El correo electrónico ya está en uso por otro miembro');
        }
      }

      const sanitizedData = sanitizeMemberData(data);

      if (sanitizedData.role) {
        const currentMember = await this.getMemberById(organizationId, id);
        if (currentMember.userId) {
          await membersRepo.updateAuthRole(currentMember.userId, organizationId, sanitizedData.role as any);
        }
      }

      return membersRepo.update(organizationId, id, sanitizedData);
    },

    async deleteMember(organizationId: string, id: number) {
      const member = await membersRepo.findById(organizationId, id);

      if (member?.userId) {
        await membersRepo.deleteAuthMember(member.userId, organizationId);
      }

      await membersRepo.delete(organizationId, id);
    },

    async resendInvite(organizationId: string, id: number, ctx?: { auth: Auth; headers: Headers }) {
      const member = await this.getMemberById(organizationId, id);

      if (member.userId) {
        throw new Error('El usuario ya tiene una cuenta vinculada');
      }

      const existingUser = await usersRepo.findByEmail(member.email);

      if (existingUser) {
        const isAlreadyMember = await membersRepo.findAuthMember(existingUser.id, organizationId);

        if (isAlreadyMember) {
          await membersRepo.update(organizationId, member.id, { userId: existingUser.id });
          return { success: true, linked: true };
        }
      }

      // Re-issue JWT invite token and dispatch email registration invite event
      const token = await tokenService.signInviteToken(organizationId, member.id, member.email);
      if (taskQueue) {
        await taskQueue.send({
          type: 'email.registration_invite',
          email: member.email,
          token,
        });
      }

      return { success: true };
    },
  };
}

export type MembersService = ReturnType<typeof createMembersService>;
