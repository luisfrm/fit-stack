import { Hono } from 'hono';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createReportsService } from '../services/reports.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

export const reportRoutes = new Hono<AppEnv>()
  // GET /api/reports/revenue
  .get('/revenue', requireOrgPermission(PM.REPORTS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const timezone = c.req.query('timezone') || 'America/Caracas';
    const monthsCount = Number(c.req.query('monthsCount') || '12');

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:reports:revenue:${monthsCount}m`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const paymentsRepo = createPaymentsRepository(c.get('db'));
    const reportsService = createReportsService(paymentsRepo);

    const revenue = await reportsService.getMonthlyRevenue(orgId, timezone, monthsCount);
    await cache.set(cacheKey, revenue, 3600); // Cache 1 hour
    return c.json(revenue);
  });
