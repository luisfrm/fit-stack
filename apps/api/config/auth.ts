import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";
import { env } from "./envs";
import { urls } from "./urls";
import { organization } from "better-auth/plugins";
import { GLOBAL_ROLES, orgRoleDefinitions, ORGANIZATION_ADDITIONAL_FIELDS } from "@workspace/shared";
import { emailService } from "@/services/email.service";
import { membersRepository } from "@/repositories/members.repository";

const DEV_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3003",
];

const PROD_ORIGINS = env.trustedOrigins
  ? env.trustedOrigins.split(",").map((s: string) => s.trim()).filter(Boolean)
  : [];

const ALLOWED_ORIGINS = env.isProduction ? PROD_ORIGINS : DEV_ORIGINS;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      member: schema.authMember,
    },
  }),
  secret: env.betterAuthSecret!,

  trustedOrigins: ALLOWED_ORIGINS,
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: GLOBAL_ROLES.USER, // El rol global en la DB. Para Master Admin será "admin"
        input: false,
      },
    },
  },
  plugins: [
    organization({
      schema: {
        organization: {
          additionalFields: ORGANIZATION_ADDITIONAL_FIELDS
        }
      },
      roles: orgRoleDefinitions,
      async sendInvitationEmail(data) {
        const inviteLink = `${urls.cms}/accept-invitation/${data.id}`;
        await emailService.sendOrganizationInvite(
          data.email,
          data.organization.name,
          data.inviter.user.name,
          inviteLink
        );
      },
      organizationHooks: {
        afterAcceptInvitation: async ({ user, organization }) => {
          // Link gymMember.userId when invitation is accepted
          const gymMemberRecord = await membersRepository.findByEmail(
            organization.id,
            user.email
          );
          if (gymMemberRecord && !gymMemberRecord.userId) {
            await membersRepository.update(organization.id, gymMemberRecord.id, {
              userId: user.id
            });
          }
        },
      },
    }),
  ],

  emailAndPassword: {
    enabled: true,
  },

  advanced: {
    crossSubDomainCookies: {
      enabled: !env.isLocal,
      domain: env.isLocal ? undefined : env.cookieDomain!,
    },
    defaultCookieAttributes: {
      sameSite: env.isLocal ? "lax" : "none",
      secure: !env.isLocal,
      domain: env.isLocal ? undefined : env.cookieDomain,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;