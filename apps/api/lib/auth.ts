import { createNeonAuth } from '@neondatabase/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
  // @ts-ignore: Neon Auth beta wrapper doesn't expose all Better Auth config types yet
  trustedOrigins: ["http://localhost:3001", "http://localhost:3002"],
  // @ts-ignore
  advanced: {
    crossSubDomainCookies: {
      enabled: true
    }
  }
});
