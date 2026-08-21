import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/members',
  '/staff',
  '/payments',
  '/content',
  '/memberships',
  '/classes',
  '/trainers',
  '/chat',
  '/settings',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionCookie = getSessionCookie(request);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/members/:path*',
    '/staff/:path*',
    '/payments/:path*',
    '/content/:path*',
    '/memberships/:path*',
    '/classes/:path*',
    '/trainers/:path*',
    '/chat/:path*',
    '/settings/:path*',
  ],
};
