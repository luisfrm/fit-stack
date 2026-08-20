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
    const orgId = c.get('session')!.activeOrganizationId!;
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:settings`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    const allSettings = await settingsService.getAll(orgId);
    await cache.set(cacheKey, allSettings, 600);
    return c.json(allSettings);
  })

  // GET /api/settings/:key
  .get('/:key', requireOrgPermission(PM.SETTINGS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const key = c.req.param('key');

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    const value = await settingsService.getByKey(orgId, key);
    return c.json({ key, value: value ?? null });
  })

  // POST /api/settings
  .post('/', requireOrgPermission(PM.SETTINGS, PA.UPDATE), zValidator('json', settingsSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const body = c.req.valid('json');
    const cache = createCache(c.env);

    const settingsRepo = createSettingsRepository(c.get('db'));
    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settingsService = createSettingsService(settingsRepo, platformSettingsRepo);

    await settingsService.updateAll(orgId, body);
    await cache.invalidateExact(`org:${orgId}:settings`);

    // Return the full settings so the client can update its local state
    // with the complete set (not just the partial patch).
    const allSettings = await settingsService.getAll(orgId);
    await cache.set(`org:${orgId}:settings`, allSettings, 600);
    return c.json(allSettings);
  });
