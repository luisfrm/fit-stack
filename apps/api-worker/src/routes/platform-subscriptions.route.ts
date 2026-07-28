import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const createManualSubSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.number().int().positive(),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  isTrial: z.boolean().default(false),
  priceOverride: z.string().optional(),
  paymentMethod: z.string().default('manual'),
  currency: z.string().default('USD'),
  amount: z.string().optional(),
  paymentStatus: z.string().optional(),
  exchangeRateApplied: z.string().optional(),
  paymentMethodDetails: z.record(z.string(), z.any()).optional(),
  paymentDate: z.string().optional().transform((str) => (str ? new Date(str) : undefined)),
});

export const platformSubscriptionRoutes = new Hono<AppEnv>()
  // GET /api/platform/subscriptions
  .get('/', requirePlatformAuth(), async (c) => {
    const status = c.req.query('status') as any;
    const planId = c.req.query('planId') ? Number(c.req.query('planId')) : undefined;
    const organizationId = c.req.query('organizationId');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    const cache = createCache(c.env);
    const cacheKey = `platform:subscriptions:${c.req.url}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const subscriptions = await service.getAllSubscriptions({
      status,
      planId,
      organizationId,
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

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const stats = await service.getStats();
    await cache.set(cacheKey, stats, 300);
    return c.json(stats);
  })

  // GET /api/platform/subscriptions/:id
  .get('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const subscription = await service.getSubscriptionById(id);
    if (!subscription) return c.json({ error: 'Suscripción no encontrada' }, 404);

    return c.json(subscription);
  })

  // POST /api/platform/subscriptions
  .post('/', requirePlatformAuth(), zValidator('json', createManualSubSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const newSub = await service.createManualSubscription(data);
    await cache.invalidate('platform:subscriptions*');
    await cache.invalidateExact(`org:${data.organizationId}:subscription-status`);
    return c.json(newSub, 201);
  })

  // POST /api/platform/subscriptions/:id/cancel
  .post('/:id/cancel', requirePlatformAuth(), zValidator('json', z.object({ reason: z.string().optional() })), async (c) => {
    const id = Number(c.req.param('id'));
    const { reason } = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const cancelled = await service.cancelSubscription(id, reason);
    await cache.invalidate('platform:subscriptions*');
    return c.json(cancelled);
  })

  // DELETE /api/platform/subscriptions/:id
  .delete('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    await service.deleteSubscription(id);
    await cache.invalidate('platform:subscriptions*');
    return c.json({ success: true });
  });
