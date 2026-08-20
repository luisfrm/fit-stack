import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createPlansRepository } from '../repositories/plans.repository';
import { createPlansService } from '../services/plans.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const planSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  price: z.union([z.string(), z.number()]),
  currency: z.string().min(1, 'La moneda es requerida'),
  durationValue: z.number().int().positive(),
  durationUnit: z.enum(['day', 'week', 'month', 'year']),
  features: z.array(z.string()).nullable().optional(),
  isPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isVisibleOnSite: z.boolean().default(true),
});

export const planRoutes = new Hono<AppEnv>()
  // GET /api/plans
  .get('/', requireOrgPermission(PM.PLANS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const includeStats = c.req.query('includeStats') === 'true';
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:plans:${c.req.url}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const plans = await plansService.getAll(orgId, { includeStats });
    await cache.set(cacheKey, plans, 300);
    return c.json(plans);
  })

  // GET /api/plans/summary
  .get('/summary', requireOrgPermission(PM.PLANS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const timezone = c.req.query('timezone') || 'America/Caracas';

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const summary = await plansService.getSummary(orgId, timezone);
    return c.json(summary);
  })

  // GET /api/plans/:id
  .get('/:id', requireOrgPermission(PM.PLANS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const plan = await plansService.findById(orgId, id);
    if (!plan) {
      return c.json({ error: 'Plan no encontrado' }, 404);
    }
    return c.json(plan);
  })

  // POST /api/plans
  .post('/', requireOrgPermission(PM.PLANS, PA.CREATE), zValidator('json', planSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const newPlan = await plansService.create(orgId, data as any);
    await cache.invalidate(`org:${orgId}:plans:*`);
    return c.json(newPlan, 201);
  })

  // PUT /api/plans/:id
  .put('/:id', requireOrgPermission(PM.PLANS, PA.UPDATE), zValidator('json', planSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const plan = await plansService.findById(orgId, id);
    if (!plan) {
      return c.json({ error: 'Plan no encontrado' }, 404);
    }

    const updatedPlan = await plansService.update(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:plans:*`);
    return c.json(updatedPlan);
  })

  // DELETE /api/plans/:id
  .delete('/:id', requireOrgPermission(PM.PLANS, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const plansRepo = createPlansRepository(c.get('db'));
    const plansService = createPlansService(plansRepo);

    const plan = await plansService.findById(orgId, id);
    if (!plan) {
      return c.json({ error: 'Plan no encontrado' }, 404);
    }

    await plansService.delete(orgId, id);
    await cache.invalidate(`org:${orgId}:plans:*`);
    return c.json({ success: true });
  });
