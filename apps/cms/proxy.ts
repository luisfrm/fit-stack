import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Nueva convención de Next.js 16
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supongamos que todas las rutas bajo /dashboard/* están protegidas
  if (pathname.startsWith('/dashboard')) {
    const isAuthenticated = false; // Aquí iría tu lógica de auth (cookies, session, etc)

    if (!isAuthenticated) {
      // Redirigir al login si no está autenticado
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
