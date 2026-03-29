import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from "@/lib/auth-client";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // En el middleware, pasamos las cabeceras de la petición actual
  const { data: session } = await getSession({
    fetchOptions: {
      headers: request.headers
    }
  });

  // Rutas protegidas
  if (pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
