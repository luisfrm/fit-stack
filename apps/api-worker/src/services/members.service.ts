import type { MembersRepository, MembersFilter, NewDbMember } from '../repositories/members.repository';
import type { UsersRepository } from '../repositories/users.repository';
import type { TokenService } from './token.service';
import type { Auth } from '../lib/env';
import { OrganizationDateManager } from '../lib/date-manager';
import { DEFAULT_MEMBER_VALUES } from '@workspace/shared';

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
  const sendMemberInvitation = async (
    newMember: { id: number; email: string },
    organizationId: string,
    role: string | null | undefined,
    ctx?: { auth: Auth; headers: Headers }
  ) => {
    const existingUser = await usersRepo.findByEmail(newMember.email);

    if (existingUser) {
      const isAlreadyMember = await membersRepo.findAuthMember(existingUser.id, organizationId);
      if (isAlreadyMember) {
        await membersRepo.update(organizationId, newMember.id, { userId: existingUser.id });
      } else if (ctx) {
        try {
          await (ctx.auth.api as any).createInvitation({
            headers: ctx.headers,
            body: {
              email: newMember.email,
              role: role as any,
              organizationId,
              resend: true,
            },
          });
        } catch (inviteError: any) {
          console.error('Failed to create Better Auth invitation:', inviteError);
        }
      }
      return;
    }

    const token = await tokenService.signInviteToken(organizationId, newMember.id, newMember.email);
    if (taskQueue) {
      await taskQueue.send({
        type: 'email.registration_invite',
        email: newMember.email,
        token,
        target: 'panel',
      });
    }
  };

  return {
    async getAllMembers(filters: MembersFilter) {
      if (!filters.organizationId) throw new Error('organizationId is required');
      return membersRepo.findAll(filters);
    },

    /**
     * Customer KPIs. `timezone` is required without default (AGENTS §9):
     * comes from `requireOrgTimezone()` middleware (session, never query param).
     */
    async getMemberStats(organizationId: string, timezone: string) {
      if (!organizationId) throw new Error('organizationId is required');
      const dateManager = new OrganizationDateManager(timezone);
      return membersRepo.getMemberStats(organizationId, dateManager, new Date());
    },

    async getMemberById(organizationId: string, id: number) {
      const member = await membersRepo.findById(organizationId, id);
      if (!member) {
        throw new Error('Miembro no encontrado');
      }
      return member;
    },

    async findMemberById(organizationId: string, id: number) {
      return membersRepo.findById(organizationId, id);
    },

    async getMemberByUserId(organizationId: string, userId: string) {
      return membersRepo.findByUserId(organizationId, userId);
    },

    async createMember(
      organizationId: string,
      data: Omit<NewDbMember, 'organizationId'>,
      sendInvite: boolean,
      ctx?: { auth: Auth; headers: Headers }
    ) {
      // Explicit defaults via spread (`sendInvite` is not a column: omitted from insert).
      const { sendInvite: _flag, ...memberFields } = { ...DEFAULT_MEMBER_VALUES, ...data };
      const sanitizedData = sanitizeMemberData(memberFields);
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
        await sendMemberInvitation(
          newMember,
          organizationId,
          sanitizedData.role,
          ctx
        );
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

    /**
     * Soft delete. A member with financial history must never be hard-deleted
     * (financial record is immutable); the row is flagged and hidden, history
     * preserved. No interactive transactions (Neon HTTP): access is revoked
     * first, then the row is flagged, and the outcome is confirmed by re-read.
     * Returns `null` when the member does not exist (route maps to 404);
     * re-deleting an already-deleted member is a no-op success (idempotent).
     */
    async deleteMember(organizationId: string, id: number) {
      const member = await membersRepo.findById(organizationId, id, { includeDeleted: true });

      if (!member) return null;
      if (member.deletedAt) return member;

      if (member.userId) {
        await membersRepo.deleteAuthMember(member.userId, organizationId);
      }

      await membersRepo.softDelete(organizationId, id);

      // Fail-closed: confirm by re-read, never assume the UPDATE landed.
      const reRead = await membersRepo.findById(organizationId, id, { includeDeleted: true });
      if (!reRead?.deletedAt) {
        throw new Error('No se pudo eliminar el miembro');
      }
      return reRead;
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
          target: 'panel',
        });
      }

      return { success: true };
    },
  };
}

export type MembersService = ReturnType<typeof createMembersService>;
