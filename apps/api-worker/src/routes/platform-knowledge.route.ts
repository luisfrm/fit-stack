import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createKnowledgeRepository } from '../repositories/knowledge.repository';
import { createKnowledgeService } from '../services/knowledge.service';
import { createAIService } from '../services/ai.service';
import type { AppEnv } from '../lib/env';

const documentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  source: z.enum(['faq', 'policy', 'settings']).default('faq'),
  content: z.string().min(1).max(20_000),
});

const documentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  source: z.enum(['faq', 'policy', 'settings']).optional(),
  content: z.string().min(1).max(20_000).optional(),
  isActive: z.boolean().optional(),
});

export const platformKnowledgeRoutes = new Hono<AppEnv>()
  .get('/', requirePlatformAuth(), async (c) => {
    const service = createKnowledgeService(
      createKnowledgeRepository(c.get('db')),
      createAIService(c.env),
    );
    return c.json(await service.list(null));
  })

  .get('/:id', requirePlatformAuth(), async (c) => {
    const service = createKnowledgeService(
      createKnowledgeRepository(c.get('db')),
      createAIService(c.env),
    );
    return c.json(await service.getById(c.req.param('id')));
  })

  .post('/', requirePlatformAuth(), zValidator('json', documentCreateSchema), async (c) => {
    const body = c.req.valid('json');
    if (!c.env.CLOUDFLARE_AI_API_TOKEN || !c.env.CLOUDFLARE_ACCOUNT_ID) {
      return c.json({ error: 'IA no configurada: faltan credenciales de embedding' }, 503);
    }
    const service = createKnowledgeService(
      createKnowledgeRepository(c.get('db')),
      createAIService(c.env),
    );
    return c.json(await service.create(body), 201);
  })

  .patch('/:id', requirePlatformAuth(), zValidator('json', documentUpdateSchema), async (c) => {
    const body = c.req.valid('json');
    const needsEmbedding = body.content !== undefined;
    if (needsEmbedding && (!c.env.CLOUDFLARE_AI_API_TOKEN || !c.env.CLOUDFLARE_ACCOUNT_ID)) {
      return c.json({ error: 'IA no configurada: faltan credenciales de embedding' }, 503);
    }
    const service = createKnowledgeService(
      createKnowledgeRepository(c.get('db')),
      createAIService(c.env),
    );
    return c.json(await service.update(c.req.param('id'), body));
  })

  .delete('/:id', requirePlatformAuth(), async (c) => {
    const service = createKnowledgeService(
      createKnowledgeRepository(c.get('db')),
      createAIService(c.env),
    );
    return c.json(await service.remove(c.req.param('id')));
  });
