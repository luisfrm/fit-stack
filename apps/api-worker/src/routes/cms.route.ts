import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createContentPagesRepository } from '../repositories/content-pages.repository';
import { createContentBlocksRepository } from '../repositories/content-blocks.repository';
import { createContentPagesService } from '../services/content-pages.service';
import { createContentBlocksService } from '../services/content-blocks.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const pageSchema = z.object({
  slug: z.string().min(1, 'El slug es requerido'),
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const blockSchema = z.object({
  pageId: z.number().int().positive(),
  blockType: z.enum(['hero', 'services', 'classes', 'testimonials', 'gallery', 'contact', 'team']),
  data: z.record(z.string(), z.any()),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const cmsRoutes = new Hono<AppEnv>()
  // GET /api/cms/pages
  .get('/pages', requireOrgPermission(PM.CONTENT, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const pagesRepo = createContentPagesRepository(c.get('db'));
    const pagesService = createContentPagesService(pagesRepo);

    const pages = await pagesService.getAllPages(orgId);
    return c.json(pages);
  })

  // GET /api/cms/pages/:id
  .get('/pages/:id', requireOrgPermission(PM.CONTENT, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const pagesService = createContentPagesService(pagesRepo);

    const page = await pagesService.getPageById(orgId, id);
    return c.json(page);
  })

  // POST /api/cms/pages
  .post('/pages', requireOrgPermission(PM.CONTENT, PA.CREATE), zValidator('json', pageSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const pagesService = createContentPagesService(pagesRepo);

    const newPage = await pagesService.createPage(orgId, data as any);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json(newPage, 201);
  })

  // PUT /api/cms/pages/:id
  .put('/pages/:id', requireOrgPermission(PM.CONTENT, PA.UPDATE), zValidator('json', pageSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const pagesService = createContentPagesService(pagesRepo);

    const updatedPage = await pagesService.updatePage(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json(updatedPage);
  })

  // DELETE /api/cms/pages/:id
  .delete('/pages/:id', requireOrgPermission(PM.CONTENT, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const pagesService = createContentPagesService(pagesRepo);

    await pagesService.deletePage(orgId, id);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json({ success: true });
  })

  // GET /api/cms/pages/:id/blocks
  .get('/pages/:id/blocks', requireOrgPermission(PM.CONTENT, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const pageId = Number(c.req.param('id'));

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    const blocks = await blocksService.getPageBlocks(orgId, pageId);
    return c.json(blocks);
  })

  // POST /api/cms/blocks
  .post('/blocks', requireOrgPermission(PM.CONTENT, PA.CREATE), zValidator('json', blockSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    const newBlock = await blocksService.createBlock(orgId, data as any);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json(newBlock, 201);
  })

  // PUT /api/cms/blocks/:id
  .put('/blocks/:id', requireOrgPermission(PM.CONTENT, PA.UPDATE), zValidator('json', blockSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    const updatedBlock = await blocksService.updateBlock(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json(updatedBlock);
  })

  // DELETE /api/cms/blocks/:id
  .delete('/blocks/:id', requireOrgPermission(PM.CONTENT, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    await blocksService.deleteBlock(orgId, id);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json({ success: true });
  })

  // PUT /api/cms/pages/:id/blocks/reorder
  .put('/pages/:id/blocks/reorder', requireOrgPermission(PM.CONTENT, PA.UPDATE), zValidator('json', z.object({ orders: z.array(z.object({ id: z.number(), displayOrder: z.number() })) })), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const pageId = Number(c.req.param('id'));
    const { orders } = c.req.valid('json');
    const cache = createCache(c.env);

    const pagesRepo = createContentPagesRepository(c.get('db'));
    const blocksRepo = createContentBlocksRepository(c.get('db'));
    const blocksService = createContentBlocksService(blocksRepo, pagesRepo);

    await blocksService.reorderBlocks(orgId, pageId, orders);
    await cache.invalidate(`org:${orgId}:cms:*`);
    await cache.invalidate(`org:${orgId}:public:*`);
    return c.json({ success: true });
  });
