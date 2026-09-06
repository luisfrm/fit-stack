import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createSettingsRepository } from '../repositories/settings.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createSettingsService } from '../services/settings.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const settingsSchema = z.record(z.string(), z.string());

export const platformSettingsRoutes = new Hono<AppEnv>()
  // GET /api/platform/settings
  .get('/', requirePlatformAuth(), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:settings';

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    const settings = await settingsService.getAll(null);
    // Dato de baja frecuencia: el TTL es red de seguridad; la invalidación real
    // ocurre on-write en POST /api/platform/settings.
    await cache.set(cacheKey, settings, 3600);
    return c.json(settings);
  })

  // POST /api/platform/settings
  .post('/', requirePlatformAuth(), zValidator('json', settingsSchema), async (c) => {
    const body = c.req.valid('json');
    const cache = createCache(c.env);

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    await settingsService.updateAll(null, body);
    await cache.invalidateExact('platform:settings');
    await cache.invalidateExact('ai:provider:default');
    // El free tier (feature_flags_free_tier) afecta el resolver de features de TODAS las orgs
    await cache.invalidate('org:*:features');
    // Métodos de pago de plataforma expuestos a las orgs (GET /api/organizations/payment-methods):
    // cambiar active_payment_methods / active_currencies debe reflejarse de inmediato en los forms de pago.
    await cache.invalidate('org:*:payment-methods');
    return c.json({ success: true });
  });
