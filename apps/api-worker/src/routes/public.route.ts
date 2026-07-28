import { Hono } from 'hono';
import { createCmsPagesRepository } from '../repositories/cms-pages.repository';
import { createCmsBlocksRepository } from '../repositories/cms-blocks.repository';
import { createCmsBlocksService } from '../services/cms-blocks.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

export const publicRoutes = new Hono<AppEnv>()
  // GET /api/public/pages/:slug?organizationId=...
  .get('/pages/:slug', async (c) => {
    const slug = c.req.param('slug');
    const organizationId = c.req.query('organizationId');

    if (!organizationId) {
      return c.json({ error: 'Se requiere el parámetro organizationId' }, 400);
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${organizationId}:public:page:${slug}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const pagesRepo = createCmsPagesRepository(c.get('db'));
    const blocksRepo = createCmsBlocksRepository(c.get('db'));
    const blocksService = createCmsBlocksService(blocksRepo, pagesRepo);

    const pageData = await blocksService.getPublicPage(organizationId, slug);
    await cache.set(cacheKey, pageData, 900); // Cache for 15 minutes
    return c.json(pageData);
  })

  // GET /api/public/files/*
  .get('/files/*', async (c) => {
    const key = c.req.path.replace('/api/public/files/', '');
    if (!c.env.FILES_BUCKET) {
      return c.text('FILES_BUCKET binding is missing', 500);
    }
    const object = await c.env.FILES_BUCKET.get(key);
    if (!object) {
      return c.text('File not found', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { headers });
  });

