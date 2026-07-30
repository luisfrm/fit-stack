import { getSessionCookie } from 'better-auth/cookies';
import { NextRequest } from 'next/server';

/**
 * Helper to get the correct session cookie token.
 */
export function getAuthSessionCookie(request: NextRequest): { name: string; value: string } | null {
  const cookie = getSessionCookie(request);
  return cookie as { name: string; value: string } | null;
}
