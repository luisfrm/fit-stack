import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformPermission } from '../lib/route-handler';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformPlansService } from '../services/platform-plans.service';
import { createCache } from '../lib/cache';
import { FEATURE_CATALOG, API_ERROR_CODES } from '@workspace/shared';
import type { AppEnv } from '../lib/env';

const featureLimitsSchema = z.record(z.string(), z.number().int().min(0));

const featureValueSchema = z.object({
  enabled: z.boolean(),
  limits: featureLimitsSchema.optional(),
});

/**
 * Features validated against catalog: unknown IDs -> 400.
 * (Catalog is the source of truth in code; DB only persists values.)
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
  currency: z.string().min(1, 'La moneda es requerida'),
  durationValue: z.number().int().min(1).optional(),
  durationUnit: z.enum(['day', 'week', 'month', 'year']).optional(),
  isActive: z.boolean().default(true),
  features: featuresSchema.nullable().optional(),
});

/**
 * The plan currency freezes the rate used to price every payment of the plan,
 * so it cannot change once a payment exists: historical snapshots keep their
 * own currency but the plan would start quoting a different one silently.
 * Answers `409 PLAN_CURRENCY_IMMUTABLE` by `code`, never a generic 400.
 */
async function planCurrencyError(
  repo: ReturnType<typeof createPlatformPlansRepository>,
  planId: number,
  currency: string | undefined,
): Promise<Response | null> {
  if (!currency) return null;
  const plan = await repo.findById(planId);
  if (!plan || plan.currency === currency) return null;
  const payments = await repo.countPaymentsByPlan(planId);
  if (payments === 0) return null;
  return new Response(
    JSON.stringify({
      error: 'La moneda del plan no se puede cambiar porque ya tiene pagos registrados.',
      code: API_ERROR_CODES.PLAN_CURRENCY_IMMUTABLE,
    }),
    { status: 409, headers: { 'content-type': 'application/json' } },
  );
}

export const platformPlanRoutes = new Hono<AppEnv>()
  // GET /api/platform/plans
  .get('/', requirePlatformPermission('plan', 'list'), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:plans';

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plans = await service.getAllPlans();
    // Low frequency data: TTL is safety net; actual invalidation
    // occurs on-write in POST/PUT/PATCH/DELETE of this same route.
    await cache.set(cacheKey, plans, 3600);
    return c.json(plans);
  })

  // GET /api/platform/plans/with-stats
  .get('/with-stats', requirePlatformPermission('plan', 'list'), async (c) => {
    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plans = await service.getAllPlansWithStats();
    return c.json(plans);
  })

  // GET /api/platform/plans/summary
  .get('/summary', requirePlatformPermission('plan', 'list'), async (c) => {
    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const summary = await service.getSummary();
    return c.json(summary);
  })

  // GET /api/platform/plans/:id
  .get('/:id', requirePlatformPermission('plan', 'list'), async (c) => {
    const id = Number(c.req.param('id'));

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const plan = await service.getPlanById(id);
    return c.json(plan);
  })

  // POST /api/platform/plans
  .post('/', requirePlatformPermission('console', 'manage'), zValidator('json', platformPlanSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const newPlan = await service.createPlan(data as any);
    await cache.invalidate('platform:plans*');
    return c.json(newPlan, 201);
  })

  // PUT /api/platform/plans/:id
  .put('/:id', requirePlatformPermission('console', 'manage'), zValidator('json', platformPlanSchema.partial()), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    const currencyError = await planCurrencyError(repo, id, data.currency);
    if (currencyError) return currencyError;

    const updatedPlan = await service.updatePlan(id, data as any);
    await cache.invalidate('platform:plans*');
    await cache.invalidate('org:*:features');
    return c.json(updatedPlan);
  })

  // PATCH /api/platform/plans/:id (PUT alias for client compatibility)
  .patch('/:id', requirePlatformPermission('console', 'manage'), zValidator('json', platformPlanSchema.partial()), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    // Same guard as PUT: the PATCH alias must not bypass it.
    const currencyError = await planCurrencyError(repo, id, data.currency);
    if (currencyError) return currencyError;

    const updatedPlan = await service.updatePlan(id, data as any);
    await cache.invalidate('platform:plans*');
    await cache.invalidate('org:*:features');
    return c.json(updatedPlan);
  })

  // DELETE /api/platform/plans/:id
  .delete('/:id', requirePlatformPermission('console', 'manage'), async (c) => {
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const repo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformPlansService(repo);

    await service.deletePlan(id);
    await cache.invalidate('platform:plans*');
    await cache.invalidate('org:*:features');
    return c.json({ success: true });
  });
