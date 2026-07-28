import { Hono } from 'hono';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createDashboardRepository } from '../repositories/dashboard.repository';
import { createDashboardService } from '../services/dashboard.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

export const dashboardRoutes = new Hono<AppEnv>()
  // GET /api/dashboard/stats
  .get('/stats', requireOrgPermission(PM.DASHBOARD, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const today = c.req.query('today');

    if (!today) {
      return c.json({ error: 'Parameter today (YYYY-MM-DD) is required' }, 400);
    }

    const auth = c.get('auth');
    const fullOrg = await (auth.api as any).getFullOrganization({
      headers: c.req.raw.headers,
    });

    const timezone = (fullOrg as any)?.timezone ?? 'America/Caracas';
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:dashboard:stats:${today}`;

    const cachedStats = await cache.get(cacheKey);
    if (cachedStats) {
      return c.json(cachedStats);
    }

    const dashboardRepo = createDashboardRepository(c.get('db'));
    const dashboardService = createDashboardService(dashboardRepo);

    const stats = await dashboardService.getDashboardSummary(orgId, timezone, today);
    await cache.set(cacheKey, stats, 300);

    return c.json(stats);
  });
