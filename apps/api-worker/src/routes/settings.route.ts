import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSettingsRepository } from '../repositories/settings.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createSettingsService } from '../services/settings.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const settingsSchema = z.record(z.string(), z.string());

export const settingsRoutes = new Hono<AppEnv>()
  // GET /api/settings
  .get('/', requireOrgPermission(PM.SETTINGS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:settings`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    const allSettings = await settingsService.getAll(orgId);
    // Dato de baja frecuencia: el TTL es red de seguridad; la invalidación real
    // ocurre on-write en POST /api/settings.
    await cache.set(cacheKey, allSettings, 3600);
    return c.json(allSettings);
  })

  // GET /api/settings/:key
  .get('/:key', requireOrgPermission(PM.SETTINGS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const key = c.req.param('key');

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    const value = await settingsService.getByKey(orgId, key);
    return c.json({ key, value: value ?? null });
  })

  // POST /api/settings
  .post('/', requireOrgPermission(PM.SETTINGS, PA.UPDATE), zValidator('json', settingsSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const body = c.req.valid('json');
    const cache = createCache(c.env);

    // primary_currency/currency_format son columnas de `organization`, no settings.
    if ('primary_currency' in body || 'currency_format' in body) {
      return c.json(
        { error: 'primary_currency y currency_format se gestionan en la organización, no en settings' },
        400
      );
    }

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    await settingsService.updateAll(orgId, body);
    await cache.invalidateExact(`org:${orgId}:settings`);

    // Return the full settings so the client can update its local state
    // with the complete set (not just the partial patch).
    const allSettings = await settingsService.getAll(orgId);
    await cache.set(`org:${orgId}:settings`, allSettings, 3600);
    return c.json(allSettings);
  });
