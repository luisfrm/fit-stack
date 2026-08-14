import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createCache } from '../lib/cache';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';
import type { AppEnv } from '../lib/env';

const paymentStatusEnum = z.enum([
  PAYMENT_STATUSES.PENDING,
  PAYMENT_STATUSES.PROCESSING,
  PAYMENT_STATUSES.VALIDATED,
  PAYMENT_STATUSES.INVALID,
  PAYMENT_STATUSES.VOIDED,
  PAYMENT_STATUSES.REFUNDED,
]);

const paymentSchema = z.object({
  amountPaidCents: z.number().int().nonnegative(),
  currencyPaid: z.string().min(1),
  exchangeRateApplied: z.string().optional(),
  baseAmountCents: z.number().int().nonnegative().optional(),
  paymentMethod: z.string().min(1),
  paymentMethodDetails: z.record(z.string(), z.any()).optional(),
  status: paymentStatusEnum,
  paymentDate: z.string().optional(),
});

const createSubscriptionSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.number().int().positive(),
  startDate: z.string().optional(),
  isTrial: z.boolean().default(false),
  priceOverrideCents: z.number().int().nonnegative().optional(),
  payment: paymentSchema,
});

const renewSchema = z.object({
  payment: paymentSchema,
});

const changePlanSchema = z.object({
  newPlanId: z.number().int().positive(),
  isTrial: z.boolean().default(false),
  priceOverrideCents: z.number().int().nonnegative().optional(),
  payment: paymentSchema,
});

const registerPaymentSchema = paymentSchema;

const updatePaymentStatusSchema = z.object({
  status: paymentStatusEnum,
});

const cancelSchema = z.object({
  reason: z.string().optional(),
});

const extendSchema = z.object({
  newEndDate: z.string().transform((str) => new Date(str)),
});

function buildService(c: any) {
  const repo = createPlatformSubscriptionsRepository(c.get('db'));
  const plansRepo = createPlatformPlansRepository(c.get('db'));
  return { repo, plansRepo, service: createPlatformSubscriptionsService(repo, plansRepo) };
}

export const platformSubscriptionRoutes = new Hono<AppEnv>()
  // GET /api/platform/subscriptions
  .get('/', requirePlatformAuth(), async (c) => {
    const status = c.req.query('status') as any;
    const planId = c.req.query('planId') ? Number(c.req.query('planId')) : undefined;
    const organizationId = c.req.query('organizationId');
    const search = c.req.query('search');
    const isTrial = c.req.query('isTrial') !== undefined ? c.req.query('isTrial') === 'true' : undefined;
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    const cache = createCache(c.env);
    const cacheKey = `platform:subscriptions:${c.req.url}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const subscriptions = await service.getAllSubscriptions({
      status,
      planId,
      organizationId,
      isTrial,
      search,
      page,
      limit,
    });

    await cache.set(cacheKey, subscriptions, 300);
    return c.json(subscriptions);
  })

  // GET /api/platform/subscriptions/stats
  .get('/stats', requirePlatformAuth(), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:subscriptions:stats';

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const stats = await service.getStats();
    await cache.set(cacheKey, stats, 300);
    return c.json(stats);
  })

  // GET /api/platform/subscriptions/:id
  .get('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));
    const { service } = buildService(c);

    const subscription = await service.getSubscriptionById(id);
    if (!subscription) return c.json({ error: 'Suscripción no encontrada' }, 404);

    return c.json(subscription);
  })

  // POST /api/platform/subscriptions
  .post('/', requirePlatformAuth(), zValidator('json', createSubscriptionSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const result = await service.createSubscriptionWithPayment(data);

    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${data.organizationId}:subscription-status`);

    const created = await service.getSubscriptionById(result.subscriptionId);
    return c.json(created, 201);
  })

  // POST /api/platform/subscriptions/:id/cancel
  .post('/:id/cancel', requirePlatformAuth(), zValidator('json', cancelSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const { reason } = c.req.valid('json');
    const cache = createCache(c.env);

    const { service, repo } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.cancelSubscription(id, reason);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);

    return c.json({ success: true, id });
  })

  // POST /api/platform/subscriptions/:id/extend
  .post('/:id/extend', requirePlatformAuth(), zValidator('json', extendSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const { newEndDate } = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.extendSubscriptionPeriod(id, newEndDate);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);

    return c.json({ success: true, newEndDate });
  })

  // POST /api/platform/subscriptions/:id/renew
  .post('/:id/renew', requirePlatformAuth(), zValidator('json', renewSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    const result = await service.renewSubscription(id, data);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);

    return c.json({ success: true, ...result });
  })

  // PATCH /api/platform/subscriptions/payments/:paymentId/status
  .patch('/payments/:paymentId/status', requirePlatformAuth(), zValidator('json', updatePaymentStatusSchema), async (c) => {
    const paymentId = Number(c.req.param('paymentId'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const payment = await service.getPaymentById(paymentId);
    if (!payment) return c.json({ error: 'Pago no encontrado' }, 404);

    await service.updatePaymentStatus(paymentId, data);
    await cache.invalidate('platform:subscriptions*');
    if (payment.organizationId) {
      await cache.invalidateExact(`org:${payment.organizationId}:subscription-status`);
    }

    return c.json({ success: true, paymentId, status: data.status });
  })

  // GET /api/platform/subscriptions/:id/payments
  .get('/:id/payments', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));
    const { service } = buildService(c);

    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    const payments = await service.getSubscriptionPayments(id);
    return c.json({ data: payments });
  })

  // POST /api/platform/subscriptions/:id/payments
  .post('/:id/payments', requirePlatformAuth(), zValidator('json', registerPaymentSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    const result = await service.registerPayment(id, data);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);

    return c.json({ success: true, ...result }, 201);
  })

  // DELETE /api/platform/subscriptions/:id
  .delete('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.deleteSubscription(id);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);

    return c.json({ success: true });
  });
