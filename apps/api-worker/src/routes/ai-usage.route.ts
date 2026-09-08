import { Hono } from 'hono';
import { requireAuth, requireOrg } from '../lib/route-handler';
import { createFeaturesService } from '../services/features.service';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

/**
 * GET /api/ai/usage — créditos IA del ciclo (usado/límite mensual).
 */
export const aiUsageRoutes = new Hono<AppEnv>()
  .get('/', requireAuth(), requireOrg(), async (c) => {
    const orgId = c.get('orgId')!;

    const db = c.get('db');
    const cache = createCache(c.env);
    const service = createFeaturesService(
      createPlatformSubscriptionsRepository(db),
      createPlatformPlansRepository(db),
      createPlatformSettingsRepository(db),
      createFeaturesRepository(db),
      cache
    );

    const quota = await service.getAiQuota(orgId);
    return c.json({
      monthly: quota.monthly,
      remaining: quota.remaining,
      disabled: quota.disabled,
      periodStart: quota.periodStart,
    });
  });
