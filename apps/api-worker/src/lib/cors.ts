import { cors } from 'hono/cors';

export const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:8787',
  'http://localhost:8788',
  'https://panel.luisrivas.site',
  'https://console.luisrivas.site',
  'https://api.luisrivas.site',
  'https://luisrivas.site',
] as const;

/**
 * CORS Middleware for API Routes.
 * Returns the exact origin to allow credentialed requests (cookies), preventing browsers from rejecting Set-Cookie.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return 'http://localhost:3001';
    return origin;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
