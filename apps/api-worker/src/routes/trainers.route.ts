import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createTrainersRepository } from '../repositories/trainers.repository';
import { createTrainersService } from '../services/trainers.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const trainerSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  documentId: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  specialities: z.array(z.string()).nullable().optional(),
  bio: z.string().nullable().optional(),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const trainerRoutes = new Hono<AppEnv>()
  // GET /api/trainers
  .get('/', requireOrgPermission(PM.STAFF, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const name = c.req.query('name');
    const isVisibleStr = c.req.query('isVisible');
    const isVisible = isVisibleStr !== undefined ? isVisibleStr === 'true' : undefined;
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:coaches:${c.req.url}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const trainersRepo = createTrainersRepository(c.get('db'));
    const trainersService = createTrainersService(trainersRepo);

    const result = await trainersService.getAll(orgId, { name, isVisible, page, limit });
    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/trainers/:id
  .get('/:id', requireOrgPermission(PM.STAFF, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const trainersRepo = createTrainersRepository(c.get('db'));
    const trainersService = createTrainersService(trainersRepo);

    const trainer = await trainersService.getById(orgId, id);
    return c.json(trainer);
  })

  // POST /api/trainers
  .post('/', requireOrgPermission(PM.STAFF, PA.CREATE), zValidator('json', trainerSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const trainersRepo = createTrainersRepository(c.get('db'));
    const trainersService = createTrainersService(trainersRepo);

    const newTrainer = await trainersService.create(orgId, data as any);
    await cache.invalidate(`org:${orgId}:coaches:*`);
    return c.json(newTrainer, 201);
  })

  // PUT /api/trainers/:id
  .put('/:id', requireOrgPermission(PM.STAFF, PA.UPDATE), zValidator('json', trainerSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const trainersRepo = createTrainersRepository(c.get('db'));
    const trainersService = createTrainersService(trainersRepo);

    const updatedTrainer = await trainersService.update(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:coaches:*`);
    return c.json(updatedTrainer);
  })

  // DELETE /api/trainers/:id
  .delete('/:id', requireOrgPermission(PM.STAFF, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const trainersRepo = createTrainersRepository(c.get('db'));
    const trainersService = createTrainersService(trainersRepo);

    await trainersService.delete(orgId, id);
    await cache.invalidate(`org:${orgId}:coaches:*`);
    return c.json({ success: true });
  });
