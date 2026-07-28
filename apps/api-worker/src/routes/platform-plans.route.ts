import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformPlansService } from '../services/platform-plans.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const platformPlanSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]),
  currency: z.string().default('USD'),
  billingPeriod: z.enum(['monthly', 'yearly']).default('monthly'),
  isActive: z.boolean().default(true),
  features: z.record(z.string(), z.any()).nullable().optional(),
});

export const platformPlanRoutes = new Hono<AppEnv>()
  // GET /api/platform/plans
  .get('/', requirePlatformAuth(), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:plans';

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plans = await service.getAllPlans();
    await cache.set(cacheKey, plans, 600);
    return c.json(plans);
  })

  // GET /api/platform/plans/with-stats
  .get('/with-stats', requirePlatformAuth(), async (c) => {
    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plans = await service.getAllPlansWithStats();
    return c.json(plans);
  })

  // GET /api/platform/plans/summary
  .get('/summary', requirePlatformAuth(), async (c) => {
    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const summary = await service.getSummary();
    return c.json(summary);
  })

  // GET /api/platform/plans/:id
  .get('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plan = await service.getPlanById(id);
    return c.json(plan);
  })

  // POST /api/platform/plans
  .post('/', requirePlatformAuth(), zValidator('json', platformPlanSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const newPlan = await service.createPlan(data as any);
    await cache.invalidate('platform:plans*');
    return c.json(newPlan, 201);
  })

  // PUT /api/platform/plans/:id
  .put('/:id', requirePlatformAuth(), zValidator('json', platformPlanSchema.partial()), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const updatedPlan = await service.updatePlan(id, data as any);
    await cache.invalidate('platform:plans*');
    return c.json(updatedPlan);
  })

  // DELETE /api/platform/plans/:id
  .delete('/:id', requirePlatformAuth(), async (c) => {
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    await service.deletePlan(id);
    await cache.invalidate('platform:plans*');
    return c.json({ success: true });
  });
