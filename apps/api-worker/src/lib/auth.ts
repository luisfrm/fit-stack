import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, organization, admin as adminPlugin } from 'better-auth/plugins';
import { createDb } from '@workspace/database/factory';
import * as schema from '@workspace/database/schema';
import {
  GLOBAL_ROLES,
  ORGANIZATION_ADDITIONAL_FIELDS,
  platformAc,
  platformRoles,
  organizationAc,
  organizationRoles,
} from '@workspace/shared';
import { ALLOWED_ORIGINS } from './cors';
import { createCache } from './cache';
import { createMembersRepository } from '../repositories/members.repository';
import type { Env } from './env';
import { eq, and } from 'drizzle-orm';

/**
 * Creates a per-request Better Auth instance configured for Cloudflare Workers.
 */
export function createAuth(env: Env) {
  const db = createDb(env.DATABASE_URL);
  const cache = createCache(env);
  const membersRepo = createMembersRepository(db);
  const isLocal = env.BETTER_AUTH_URL.includes('localhost');

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        ...schema,
        member: schema.authMember,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    trustedOrigins: [...ALLOWED_ORIGINS],
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: GLOBAL_ROLES.USER,
          input: false,
        },
      },
    },
    plugins: [
      adminPlugin({
        ac: platformAc,
        roles: platformRoles,
        defaultRole: 'user',
      }),
      organization({
        ac: organizationAc,
        roles: organizationRoles,
        schema: {
          organization: {
            additionalFields: ORGANIZATION_ADDITIONAL_FIELDS,
          },
        },
        async sendInvitationEmail(data) {
          const cmsBaseUrl = isLocal ? 'http://localhost:3001' : 'https://cms.luisrivas.site';
          const inviteLink = `${cmsBaseUrl}/accept-invitation/${data.id}`;

          if (env.TASK_QUEUE) {
            await env.TASK_QUEUE.send({
              type: 'email.org_invite',
              email: data.email,
              orgName: data.organization.name,
              inviterName: data.inviter.user.name,
              inviteLink,
            });
          }
        },
        organizationHooks: {
          afterAcceptInvitation: async ({ user, organization: org }) => {
            const gymMemberRecord = await membersRepo.findByEmail(org.id, user.email);
            if (gymMemberRecord && !gymMemberRecord.userId) {
              await membersRepo.update(org.id, gymMemberRecord.id, {
                userId: user.id,
              });
            }
          },
          afterUpdateMemberRole: async ({ member }) => {
            await cache.invalidateExact(`member:role:${member.userId}:${member.organizationId}`);
          },
        },
      }),
      customSession(async ({ user, session }) => {
        const activeOrgId = (session as { activeOrganizationId?: string }).activeOrganizationId;
        if (!activeOrgId) {
          return { user, session };
        }

        const cacheKey = `member:role:${user.id}:${activeOrgId}`;
        const cached = await cache.get<{ id: string; role: string }>(cacheKey);
        if (cached) {
          return {
            user,
            session,
            member: {
              id: cached.id,
              organizationId: activeOrgId,
              userId: user.id,
              role: cached.role,
              createdAt: new Date(),
            },
          };
        }

        const [member] = await db
          .select({
            id: schema.authMember.id,
            organizationId: schema.authMember.organizationId,
            userId: schema.authMember.userId,
            role: schema.authMember.role,
            createdAt: schema.authMember.createdAt,
          })
          .from(schema.authMember)
          .where(
            and(
              eq(schema.authMember.userId, user.id),
              eq(schema.authMember.organizationId, activeOrgId)
            )
          )
          .limit(1);

        if (member) {
          await cache.set(cacheKey, { id: member.id, role: member.role }, 60);
        }

        return {
          user,
          session,
          member: member || null,
        };
      }),
    ],

    emailAndPassword: {
      enabled: true,
    },

    advanced: {
      crossSubDomainCookies: {
        enabled: !isLocal,
        domain: isLocal ? undefined : env.COOKIE_DOMAIN,
      },
      defaultCookieAttributes: {
        sameSite: isLocal ? 'lax' : 'none',
        secure: !isLocal,
        domain: isLocal ? undefined : env.COOKIE_DOMAIN,
      },
    },
  });
}
