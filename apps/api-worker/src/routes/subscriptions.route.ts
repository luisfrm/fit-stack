import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireOrgTimezone } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSubscriptionsRepository } from '../repositories/subscriptions.repository';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createPlansRepository } from '../repositories/plans.repository';
import { createMembersRepository } from '../repositories/members.repository';
import { createSubscriptionsService } from '../services/subscriptions.service';
import { createCache, type Cache } from '../lib/cache';
import { paymentMethodDetailsSchema, taxDetailSchema } from '../lib/schemas';
import type { AppEnv } from '../lib/env';

/**
 * Toda escritura de suscripción crea/actualiza un pago y mueve el periodo:
 * invalida en bloque todo lo que depende de subscriptions + payments.
 */
async function invalidateSubscriptionDependentCaches(cache: Cache, orgId: string): Promise<void> {
  await cache.invalidate(`org:${orgId}:subscriptions*`);
  await cache.invalidateExact(`org:${orgId}:subscription-status`);
  await cache.invalidateExact(`org:${orgId}:payments:analytics`);
  // `withoutActiveSubscription` de members:stats depende de subs/pagos.
  await cache.invalidateExact(`org:${orgId}:members:stats`);
  await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
  await cache.invalidate(`org:${orgId}:dashboard:action-items`);
  await cache.invalidate(`org:${orgId}:reports:revenue*`);
}

const createSubSchema = z.object({
  memberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  payment: z.object({
    // Todo dinero en centavos enteros (convención Money, ver AGENTS.md).
    amountPaid: z.number().int().positive(),
    currencyPaid: z.string(),
    exchangeRateApplied: z.string().nullable().optional(),
    paymentMethod: z.string(),
    paymentMethodDetails: paymentMethodDetailsSchema,
    status: z.enum(['processing', 'validated', 'invalid', 'voided']).optional(),
    paymentDate: z.string().optional(),
    // Desglose fiscal en centavos enteros (Fase 0: schema abierto; el
    // servicio lo calcula por defecto y solo acepta override con
    // taxOverrideReason en Fase 2).
    subtotal: z.number().int().positive().optional(),
    taxTotal: z.number().int().min(0).optional(),
    taxDetails: z.array(taxDetailSchema).optional(),
    taxOverrideReason: z.string().optional(),
  }),
});

const updateSubStatusSchema = z.object({
  status: z.enum(['active', 'cancelled']),
});

export const subscriptionRoutes = new Hono<AppEnv>()
  // GET /api/subscriptions
  .get('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
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
    const orgId = c.get('orgId')!;
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
  .post('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.CREATE), requireOrgTimezone(), zValidator('json', createSubSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const payload = c.req.valid('json');
    // La tz es obligatoria (validada por el middleware `requireOrgTimezone`).
    const timezone = c.get('orgTimezone')!;
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const newSub = await subsService.create(orgId, payload as any, timezone);
    await invalidateSubscriptionDependentCaches(cache, orgId);
    return c.json(newSub, 201);
  })

  // PUT /api/subscriptions/:id
  .put('/:id', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), zValidator('json', updateSubStatusSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json');
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    const updated = await subsService.updateStatus(orgId, id, status);
    await invalidateSubscriptionDependentCaches(cache, orgId);
    return c.json(updated);
  })

  // DELETE /api/subscriptions/:id
  .delete('/:id', requireOrgPermission(PM.SUBSCRIPTIONS, PA.DELETE), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);

    await subsService.delete(orgId, id);
    await invalidateSubscriptionDependentCaches(cache, orgId);
    return c.json({ success: true });
  });
