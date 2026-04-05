import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";
import { env } from "./envs";
import { customSession } from "better-auth/plugins";
import { dash } from "@better-auth/infra";

import { rbacService } from "../services/rbac.service";
import { rbacPlugin } from "./rbac-plugin";
import { ROLE_IDS } from "@workspace/shared/constants";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  secret: env.betterAuthSecret,

  trustedOrigins: [env.frontendUrl!],
  user: {
    additionalFields: {
      roleId: {
        type: "number",
        required: false,
        defaultValue: ROLE_IDS.CLIENT, // Cliente por defecto (ID 4)
        input: false,    // No editable por el usuario
      },
      memberId: {
        type: "number",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    rbacPlugin(),
    customSession(async ({ user, session }) => {
      try {
        const permissions = await rbacService.getUserPermissions(user.id, (user as any).roleId);

        return {
          user: {
            ...user,
            permissions,
          },
          session,
        };
      } catch (error) {
        console.error("Error fetching permissions:", error);
        return {
          user,
          permissions: [],
          session,
        };
      }
    }),
    dash()
  ],

  emailAndPassword: {
    enabled: true,
  },

  advanced: {
    crossSubdomainCookies: {
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