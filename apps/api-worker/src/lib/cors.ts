import { cors } from 'hono/cors';

export const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:8787',
  'http://localhost:8788',
  'https://fitstack-panel.luisrivas.site',
  'https://fitstack-console.luisrivas.site',
  'https://fitstack-api.luisrivas.site',
  'https://luisrivas.site',
] as const;

/**
 * Validates whether a given origin is allowed.
 * Allows localhost ports for dev and any subdomain under *.luisrivas.site.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  if (origin.startsWith('http://localhost:')) return true;

  try {
    const url = new URL(origin);
    return url.hostname === 'luisrivas.site' || url.hostname.endsWith('.luisrivas.site');
  } catch {
    return false;
  }
}

/**
 * CORS Middleware for API Routes.
 * Returns the exact origin to allow credentialed requests (cookies), preventing browsers from rejecting Set-Cookie.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return 'http://localhost:3001';
    if (isAllowedOrigin(origin)) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
