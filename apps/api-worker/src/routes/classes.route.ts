import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createClassesRepository } from '../repositories/classes.repository';
import { createClassesService } from '../services/classes.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const classSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  trainerName: z.string().min(1, 'El nombre del entrenador es requerido'),
  trainerPhoto: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  capacity: z.number().int().positive('La capacidad debe ser mayor a 0'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido (HH:mm)'),
  durationMinutes: z.number().int().positive('La duración debe ser mayor a 0'),
  frequencyType: z.enum(['once', 'weekly']),
  scheduledDate: z.string().nullable().optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).nullable().optional(),
  badgeText: z.string().nullable().optional(),
  badgeVariant: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const classRoutes = new Hono<AppEnv>()
  // GET /api/classes
  .get('/', requireOrgPermission(PM.CLASSES, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const name = c.req.query('name');
    const trainerName = c.req.query('trainerName');
    const isVisibleStr = c.req.query('isVisible');
    const isVisible = isVisibleStr !== undefined ? isVisibleStr === 'true' : undefined;
    const date = c.req.query('date');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');
    const requireTotal = c.req.query('requireTotal') === 'true';

    const classesRepo = createClassesRepository(c.get('db'));
    const classesService = createClassesService(classesRepo);

    if (date) {
      const classes = await classesService.getByDate(orgId, date);
      return c.json({ data: classes });
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:classes:${c.req.url}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const result = await classesService.getAll(orgId, {
      name,
      trainerName,
      isVisible,
      page,
      limit,
      requireTotal,
    });

    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/classes/:id
  .get('/:id', requireOrgPermission(PM.CLASSES, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const classesRepo = createClassesRepository(c.get('db'));
    const classesService = createClassesService(classesRepo);

    const item = await classesService.getById(orgId, id);
    return c.json(item);
  })

  // POST /api/classes
  .post('/', requireOrgPermission(PM.CLASSES, PA.CREATE), zValidator('json', classSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const classesRepo = createClassesRepository(c.get('db'));
    const classesService = createClassesService(classesRepo);

    const newClass = await classesService.create(orgId, data as any);
    await cache.invalidate(`org:${orgId}:classes:*`);
    return c.json(newClass, 201);
  })

  // PUT /api/classes/:id
  .put('/:id', requireOrgPermission(PM.CLASSES, PA.UPDATE), zValidator('json', classSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const classesRepo = createClassesRepository(c.get('db'));
    const classesService = createClassesService(classesRepo);

    const updatedClass = await classesService.update(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:classes:*`);
    return c.json(updatedClass);
  })

  // DELETE /api/classes/:id
  .delete('/:id', requireOrgPermission(PM.CLASSES, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const classesRepo = createClassesRepository(c.get('db'));
    const classesService = createClassesService(classesRepo);

    await classesService.delete(orgId, id);
    await cache.invalidate(`org:${orgId}:classes:*`);
    return c.json({ success: true });
  });
