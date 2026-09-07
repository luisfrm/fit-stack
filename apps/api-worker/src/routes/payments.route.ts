import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSubscriptionsRepository } from '../repositories/subscriptions.repository';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createPlansRepository } from '../repositories/plans.repository';
import { createMembersRepository } from '../repositories/members.repository';
import { createSubscriptionsService } from '../services/subscriptions.service';
import { createFinanceService } from '../services/finance.service';
import { createCache } from '../lib/cache';
import { requireOrgTimezone } from '../lib/org-timezone';
import type { AppEnv } from '../lib/env';

const updateStatusSchema = z.object({
  status: z.enum(['processing', 'validated', 'invalid', 'voided']),
});

export const paymentRoutes = new Hono<AppEnv>()
  // GET /api/payments/analytics
  .get('/analytics', requireOrgPermission(PM.REPORTS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:payments:analytics`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    // La tz es obligatoria: si la org no la tiene, lanza error (no fallback).
    const timezone = requireOrgTimezone(c.get('session'));

    const db = c.get('db');
    const paymentsRepo = createPaymentsRepository(db);
    const subsRepo = createSubscriptionsRepository(db);
    const financeService = createFinanceService(paymentsRepo, subsRepo);

    const stats = await financeService.getDashboardAnalytics(orgId, timezone);
    await cache.set(cacheKey, stats, 300);

    return c.json(stats);
  })
  // PATCH /api/payments/:id/status
  .patch('/:id/status', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), zValidator('json', updateStatusSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json');
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const updated = await subsService.updatePaymentStatus(orgId, id, status);
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    await cache.invalidateExact(`org:${orgId}:payments:analytics`);
    await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
    await cache.invalidate(`org:${orgId}:dashboard:action-items`);
    await cache.invalidate(`org:${orgId}:reports:revenue*`);
    return c.json(updated);
  })

  // POST /api/payments/:id/send-email
  .post('/:id/send-email', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const result = await subsService.sendReceiptEmail(orgId, id);
    return c.json(result);
  });
