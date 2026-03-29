import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas completamente públicas (sin autenticación)
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth',
];

const allowedOrigins = ['http://localhost:3001', 'http://localhost:3002'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  // 1. Manejar OPTIONS para CORS preflight
  if (request.method === 'OPTIONS') {
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : (allowedOrigins[0] || '*'),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with, x-neon-client-info',
      'Access-Control-Allow-Credentials': 'true',
    };
    return new NextResponse(null, {
      status: 204,
      headers: responseHeaders,
    });
  }

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const response = NextResponse.next();
    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    return response;
  }

  const session = await auth.getSession();

  if (!session) {
    const errorResponse = NextResponse.json(
      { error: 'Unauthorized — no active session' },
      { status: 401 }
    );
    if (isAllowedOrigin) {
      errorResponse.headers.set('Access-Control-Allow-Origin', origin);
      errorResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    return errorResponse;
  }

  const response = NextResponse.next();
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
