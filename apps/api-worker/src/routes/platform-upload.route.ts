import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createR2Service } from '../lib/r2';
import { constructStorageKey } from '../lib/storage-keys';
import type { AppEnv } from '../lib/env';

const PLATFORM_SCOPE = 'platform';

const presignedSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  folder: z.string().optional(),
  customName: z.string().optional(),
});

export const platformUploadRoutes = new Hono<AppEnv>()
  // GET /api/platform/upload?folder=
  .get('/', requirePlatformAuth(), async (c) => {
    const folder = c.req.query('folder') || '';
    const folderPath = folder && folder !== 'general' ? `${folder}/` : '';
    const prefix = `${PLATFORM_SCOPE}/${folderPath}`;

    const r2Service = createR2Service(c.env);
    const files = await r2Service.listFiles(prefix);
    return c.json(files);
  })

  // DELETE /api/platform/upload?key=platform/...
  .delete('/', requirePlatformAuth(), async (c) => {
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }

    if (!key.startsWith(`${PLATFORM_SCOPE}/`)) {
      return c.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, 403);
    }

    const r2Service = createR2Service(c.env);
    await r2Service.deleteFile(key);
    return c.json({ success: true });
  })

  // PUT /api/platform/upload/direct?key=platform/...
  .put('/direct', requirePlatformAuth(), async (c) => {
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }

    if (!key.startsWith(`${PLATFORM_SCOPE}/`)) {
      return c.json({ error: 'Forbidden: No tienes permiso para subir este archivo.' }, 403);
    }

    if (!c.env.FILES_BUCKET) {
      return c.json({ error: 'FILES_BUCKET binding is missing' }, 500);
    }

    const contentType = c.req.header('content-type') || 'application/octet-stream';
    const body = await c.req.arrayBuffer();

    await c.env.FILES_BUCKET.put(key, body, {
      httpMetadata: { contentType },
    });

    return c.json({ success: true, key });
  })

  // POST /api/platform/upload/presigned
  .post('/presigned', requirePlatformAuth(), zValidator('json', presignedSchema), async (c) => {
    const body = c.req.valid('json');

    const uniqueKey = constructStorageKey(PLATFORM_SCOPE, body.folder || 'general', body.filename, body.customName);
    const r2Service = createR2Service(c.env);
    const requestUrl = new URL(c.req.url);
    const apiBaseUrl = `${requestUrl.protocol}//${requestUrl.host}/api`;
    const result = await r2Service.getUploadUrl(uniqueKey, apiBaseUrl);

    return c.json(result);
  });