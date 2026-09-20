import { Hono } from 'hono';
import { createContentPagesRepository } from '../repositories/content-pages.repository';
import { createContentBlocksRepository } from '../repositories/content-blocks.repository';
import { createContentBlocksService } from '../services/content-blocks.service';
import { createCache } from '../lib/cache';
import { isPublicStorageKey } from '@workspace/shared';
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

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    const pageData = await blocksService.getPublicPage(organizationId, slug);
    await cache.set(cacheKey, pageData, 900); // Cache for 15 minutes
    return c.json(pageData);
  })

  // GET /api/public/files/* — SOLO lo público por diseño.
  //
  // Allowlist: assets del sitio (`<orgId>/cms/…`) y branding de la plataforma.
  // Todo lo demás (avatares, logos de org, evidencia de pago, comprobantes
  // `receipts/**` y `platform/receipts/**`) responde 404 — no se revela siquiera
  // que el objeto exista — y se entrega por las rutas autenticadas.
  .get('/files/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace('/api/public/files/', ''));
    if (!c.env.FILES_BUCKET) {
      return c.text('FILES_BUCKET binding is missing', 500);
    }
    if (!isPublicStorageKey(key)) {
      return c.text('File not found', 404);
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

