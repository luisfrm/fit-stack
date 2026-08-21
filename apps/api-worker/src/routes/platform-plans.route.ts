import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformPlansService } from '../services/platform-plans.service';
import { createCache } from '../lib/cache';
import { FEATURE_CATALOG } from '@workspace/shared';
import type { AppEnv } from '../lib/env';

const featureLimitsSchema = z.record(z.string(), z.number().int().min(0));

const featureValueSchema = z.object({
  enabled: z.boolean(),
  limits: featureLimitsSchema.optional(),
});

/**
 * Features validadas contra el catálogo: IDs desconocidos → 400.
 * (El catálogo es la fuente de verdad en código; la DB solo persiste valores.)
 */
const featuresSchema = z
  .record(z.string(), featureValueSchema)
  .refine(
    (features) => Object.keys(features).every((id) => id in FEATURE_CATALOG),
    { message: 'Features desconocidas no permitidas' }
  );

const platformPlanSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  price: z.union([z.string(), z.number()]),
  currency: z.string().default('USD'),
  durationValue: z.number().int().min(1).optional(),
  durationUnit: z.enum(['day', 'week', 'month', 'year']).optional(),
  isActive: z.boolean().default(true),
  trialDays: z.number().int().min(0).optional(),
  features: featuresSchema.nullable().optional(),
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
    await cache.invalidate('org:*:features');
    return c.json(updatedPlan);
  })

  // PATCH /api/platform/plans/:id (alias de PUT, por compatibilidad de clientes)
  .patch('/:id', requirePlatformAuth(), zValidator('json', platformPlanSchema.partial()), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const updatedPlan = await service.updatePlan(id, data as any);
    await cache.invalidate('platform:plans*');
    await cache.invalidate('org:*:features');
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
    await cache.invalidate('org:*:features');
    return c.json({ success: true });
  });
