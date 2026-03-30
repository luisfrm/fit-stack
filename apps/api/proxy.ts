import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/config/envs";

const publicRoutes = ["/api/auth", "/api/health"];

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

function setCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 200 });
    if (origin === env.frontendUrl) setCorsHeaders(res, origin);
    return res;
  }

  const response = NextResponse.next();
  if (origin === env.frontendUrl) setCorsHeaders(response, origin);

  if (isPublicRoute(pathname)) return response;

  const sessionCookie = request.cookies.get("better-auth.session_token");

  if (!sessionCookie?.value) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};