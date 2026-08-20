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
import { createCache } from '../lib/cache';
import { paymentMethodDetailsSchema } from '../lib/schemas';
import type { AppEnv } from '../lib/env';

const createSubSchema = z.object({
  memberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  payment: z.object({
    amountPaid: z.number().positive(),
    currencyPaid: z.string(),
    exchangeRateApplied: z.string().nullable().optional(),
    paymentMethod: z.string(),
    paymentMethodDetails: paymentMethodDetailsSchema,
    status: z.enum(['processing', 'validated', 'invalid', 'voided']).optional(),
    paymentDate: z.string().optional(),
  }),
});

const updateSubStatusSchema = z.object({
  status: z.enum(['active', 'cancelled']),
});

export const subscriptionRoutes = new Hono<AppEnv>()
  // GET /api/subscriptions
  .get('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const query = c.req.query('query');
    const status = c.req.query('status');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:subscriptions:${c.req.url}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const result = await subsService.getAllPaginated(orgId, { query, status, page, limit });
    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/subscriptions/recent?limit=...
  .get('/recent', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const limit = Number(c.req.query('limit') || '5');

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const recent = await subsService.getRecent(orgId, limit);
    return c.json(recent);
  })

  // POST /api/subscriptions
  .post('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.CREATE), zValidator('json', createSubSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const payload = c.req.valid('json');
    const timezone = c.req.query('timezone') || 'America/Caracas';
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const newSub = await subsService.create(orgId, payload as any, timezone);
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    await cache.invalidateExact(`org:${orgId}:subscription-status`);
    return c.json(newSub, 201);
  })

  // PUT /api/subscriptions/:id
  .put('/:id', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), zValidator('json', updateSubStatusSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json');
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const updated = await subsService.updateStatus(orgId, id, status);
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    await cache.invalidateExact(`org:${orgId}:subscription-status`);
    return c.json(updated);
  })

  // DELETE /api/subscriptions/:id
  .delete('/:id', requireOrgPermission(PM.SUBSCRIPTIONS, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    await subsService.delete(orgId, id);
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    return c.json({ success: true });
  });
