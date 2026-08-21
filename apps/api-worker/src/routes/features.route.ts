import { Hono } from 'hono';
import { requirePlatformAuth } from '../lib/route-handler';
import { createCache } from '../lib/cache';
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_VERSION,
  type FeatureCatalog,
} from '@workspace/shared';
import type { AppEnv } from '../lib/env';

/**
 * GET /api/platform/features — catálogo de features para el form de planes de console.
 * Montado en `/api/platform/features` (patrón de mounts por prefijo del repo).
 */
export const platformFeaturesRoutes = new Hono<AppEnv>()
  .get('/', requirePlatformAuth(), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:features';
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const data = { catalog: FEATURE_CATALOG as FeatureCatalog, version: FEATURE_CATALOG_VERSION };
    await cache.set(cacheKey, data, 600);
    return c.json(data);
  });