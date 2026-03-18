import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth',
];

const allowedOrigins = ['http://localhost:3001', 'http://localhost:3002'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  // 1. Manejar OPTIONS para CORS
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

  // 2. Lógica de Auth / Publicidad
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  let response: NextResponse;

  if (isPublic) {
    response = NextResponse.next();
  } else {
    // Para rutas privadas, usamos el middleware de Neon
    const authRes = await auth.middleware({
      loginUrl: '/auth/sign-in',
    })(request);
    response = (authRes as NextResponse) || NextResponse.next();
  }

  // 3. Inyectar headers de CORS en la respuesta final
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*']
};
