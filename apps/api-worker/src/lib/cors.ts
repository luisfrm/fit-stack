import { cors } from 'hono/cors';

/**
 * Allowed origins for Cross-Origin Resource Sharing (CORS) with credentials.
 * Includes development URLs for CMS, Web, and Console apps, plus production domains.
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'https://cms.luisrivas.work',
  'https://console.luisrivas.work',
  'https://api.luisrivas.work',
  'https://luisrivas.work',
] as const;

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;
    if (ALLOWED_ORIGINS.includes(origin as any)) return origin;
    // Allow dynamic gym subdomains on production base domain
    if (origin.endsWith('.luisrivas.work')) return origin;
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
