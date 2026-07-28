import { getSessionCookie } from 'better-auth/cookies';
import { env } from '@/lib/config/envs';
import { NextRequest } from 'next/server';

/**
 * Helper to get the correct session cookie token based on environment prefixes.
 * Better-Auth uses '__Secure-' prefix in production for secure cookies.
 */
export function getAuthSessionCookie(request: NextRequest): { name: string; value: string } | null {
  const cookie = getSessionCookie(request, {
    cookiePrefix: env.isLocal ? "better-auth" : "__Secure-better-auth",
  });
  return cookie as { name: string; value: string } | null;
}
