import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createKnowledgeRepository } from '../repositories/knowledge.repository';
import { createKnowledgeService } from '../services/knowledge.service';
import { createAIService } from '../services/ai.service';
import type { AppEnv } from '../lib/env';
import type { KnowledgeService } from '../services/knowledge.service';

const SVC_KEY = 'knowledgeService' as const;

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

/** Creates the knowledge service once per request and stores it in context. */
const withKnowledgeService = createMiddleware<AppEnv>(async (c, next) => {
  const service = createKnowledgeService(
    createKnowledgeRepository(c.get('db')),
    createAIService(c.env),
  );
  // Store in context for handlers via `any` to avoid polluting AppVariables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (c as any).set(SVC_KEY, service);
  await next();
});

function getSvc(c: { get: (k: string) => unknown }): KnowledgeService {
  return c.get(SVC_KEY) as KnowledgeService;
}

export const platformKnowledgeRoutes = new Hono<AppEnv>()
  .use('*', requirePlatformAuth())
  .use('*', withKnowledgeService)

  .get('/', async (c) => {
    return c.json(await getSvc(c).list(null));
  })

  .get('/:id', async (c) => {
    return c.json(await getSvc(c).getById(c.req.param('id')));
  })

  .post('/', zValidator('json', documentCreateSchema), async (c) => {
    const body = c.req.valid('json');
    if (!c.env.CLOUDFLARE_AI_API_TOKEN || !c.env.CLOUDFLARE_ACCOUNT_ID) {
      return c.json({ error: 'IA no configurada: faltan credenciales de embedding' }, 503);
    }
    return c.json(await getSvc(c).create(body), 201);
  })

  .patch('/:id', zValidator('json', documentUpdateSchema), async (c) => {
    const body = c.req.valid('json');
    if (body.content !== undefined && (!c.env.CLOUDFLARE_AI_API_TOKEN || !c.env.CLOUDFLARE_ACCOUNT_ID)) {
      return c.json({ error: 'IA no configurada: faltan credenciales de embedding' }, 503);
    }
    return c.json(await getSvc(c).update(c.req.param('id'), body));
  })

  .delete('/:id', async (c) => {
    return c.json(await getSvc(c).remove(c.req.param('id')));
  });
