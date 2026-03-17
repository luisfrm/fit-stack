import { auth } from '@/lib/auth';
import { NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth',
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (isPublic) {
    return;
  }

  return auth.middleware()(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
