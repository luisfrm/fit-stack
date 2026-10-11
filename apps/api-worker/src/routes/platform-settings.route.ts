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
    // Low frequency data: TTL is safety net; actual invalidation
    // occurs on-write in POST /api/platform/settings.
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
    // Free tier (feature_flags_free_tier) affects features resolver of ALL orgs
    await cache.invalidate('org:*:features');
    // Platform payment methods exposed to orgs (GET /api/organizations/payment-methods):
    // changing active_payment_methods / active_currencies must immediately reflect on payment forms.
    await cache.invalidate('org:*:payment-methods');
    return c.json({ success: true });
  });
