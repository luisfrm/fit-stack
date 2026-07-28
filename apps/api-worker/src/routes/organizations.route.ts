import { Hono } from 'hono';
import { requireAuth } from '../lib/route-handler';
import { GLOBAL_ROLES } from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

export const organizationRoutes = new Hono<AppEnv>()
  // GET /api/organizations/subscription-status
  .get('/subscription-status', requireAuth(), async (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;

    const userRole = (user as any).role;
    const activeOrganizationId = session.activeOrganizationId;

    if (!activeOrganizationId) {
      if (userRole === GLOBAL_ROLES.ADMIN) {
        return c.json({ status: 'active' });
      }
      return c.json({ error: 'No active organization' }, 400);
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${activeOrganizationId}:subscription-status`;

    const cached = await cache.get<{ status: string }>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const platformSubsRepo = createPlatformSubscriptionsRepository(c.get('db'));
    const platformSubsService = createPlatformSubscriptionsService(platformSubsRepo);

    const status = await platformSubsService.getOrganizationStatus(activeOrganizationId);
    const data = { status };
    await cache.set(cacheKey, data, 60);

    return c.json(data);
  });
