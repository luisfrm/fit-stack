import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/config/envs";
import { getSessionCookie } from "better-auth/cookies";

const publicRoutes = ["/api/auth", "/api/health", "/api/members/validate-token"];

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
    if (origin?.startsWith(env.frontendUrl!)) setCorsHeaders(res, origin);
    return res;
  }

  const response = NextResponse.next();
  if (origin?.startsWith(env.frontendUrl!)) setCorsHeaders(response, origin);

  if (isPublicRoute(pathname)) return response;

  const isGetSettings = pathname.startsWith("/api/settings") && request.method === "GET";
  if (isGetSettings) return response;

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: env.isLocal ? "better-auth" : "__Secure-better-auth",
  });

  if (!sessionCookie) {
    const errorResponse = NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (origin?.startsWith(env.frontendUrl!)) setCorsHeaders(errorResponse, origin);
    return errorResponse;
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};