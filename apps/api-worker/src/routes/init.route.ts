import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createInitRepository } from '../repositories/init.repository';
import { createInitService } from '../services/init.service';
import type { AppEnv } from '../lib/env';

const initSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(1, 'El nombre es requerido'),
});

export const initRoutes = new Hono<AppEnv>()
  // GET /api/init
  .get('/', async (c) => {
    const initRepo = createInitRepository(c.get('db'));
    const initService = createInitService(initRepo);

    const status = await initService.checkNeedsInit();
    return c.json(status);
  })

  // POST /api/init
  .post('/', zValidator('json', initSchema), async (c) => {
    const data = c.req.valid('json');
    const auth = c.get('auth');

    const initRepo = createInitRepository(c.get('db'));
    const initService = createInitService(initRepo);

    const adminUser = await initService.initializeAdmin(auth, data);
    return c.json(adminUser, 201);
  });
