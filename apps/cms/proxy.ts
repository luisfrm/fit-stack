import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const isLocal = process.env.APP_ENV === "development" || !process.env.APP_ENV;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log("Expected cookie:", isLocal ? "better-auth.session_token" : "__Secure-better-auth.session_token");
  console.log("Available cookies:", request.cookies.getAll().map(c => c.name));

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: isLocal ? "better-auth" : "__Secure-better-auth",
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
