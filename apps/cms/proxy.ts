import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { env } from '@/lib/config/envs';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log("Expected cookie:", env.isLocal ? "better-auth.session_token" : "__Secure-better-auth.session_token");
  console.log("Available cookies:", request.cookies.getAll().map(c => c.name));

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: env.isLocal ? "better-auth" : "__Secure-better-auth",
  });

  if (pathname.startsWith('/dashboard')) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
