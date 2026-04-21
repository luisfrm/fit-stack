import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";
import { env } from "./envs";
import { organization } from "better-auth/plugins";
import { GLOBAL_ROLES, orgRoleDefinitions, ORGANIZATION_ADDITIONAL_FIELDS } from "@workspace/shared";


export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      member: schema.authMember, // Map 'authMember' to 'member' for Better Auth
    },
  }),
  secret: env.betterAuthSecret!,

  trustedOrigins: [env.frontendUrl!],
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
      roles: orgRoleDefinitions
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