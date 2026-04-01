import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@workspace/database/client";
import * as schema from "@workspace/database/schema";
import { env } from "./envs";
import { customSession } from "better-auth/plugins";

import { rbacService } from "../services/rbac.service";
import { rbacPlugin } from "./rbac-plugin";

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
        defaultValue: 4, // Cliente por defecto
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
        // Aprovechamos que roleId ya viene en el objeto user centralizado
        const permissions = await rbacService.getUserPermissions(user.id, (user as any).roleId);

        console.log("user", user);

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