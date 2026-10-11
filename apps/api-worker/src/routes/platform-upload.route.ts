import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createR2Service } from '../lib/r2';
import { constructStorageKey } from '../lib/storage-keys';
import {
  PLATFORM_BRANDING_FOLDER,
  PLATFORM_BRANDING_PREFIX,
  PLATFORM_SCOPE,
} from '@workspace/shared';
import type { AppEnv } from '../lib/env';

/**
 * Platform assets WITHOUT organization (console): exactly the scope
 * `platform/branding/` (FitStack logo in login/emails). It is the only
 * platform prefix served publicly.
 *
 * SaaS receipts (`platform/receipts/…`) live in the same bucket but
 * outside this scope: this router cannot list, overwrite or delete them.
 *
 * Assets of AN organization from console are managed in
 * `/api/platform/organizations/:orgId/upload/*` (org specified by path).
 */
const presignedSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  customName: z.string().optional(),
});

export const platformUploadRoutes = new Hono<AppEnv>()
  // GET /api/platform/upload
  .get('/', requirePlatformAuth(), async (c) => {
    const r2Service = createR2Service(c.env);
    const files = await r2Service.listFiles(PLATFORM_BRANDING_PREFIX);
    return c.json(files);
  })

  // GET /api/platform/upload/file?key=platform/branding/... - authenticated delivery
  // (branding is also public, this is for previews with session).
  .get('/file', requirePlatformAuth(), async (c) => {
    const key = c.req.query('key');

    if (!key) return c.json({ error: 'Key is required' }, 400);
    if (!key.startsWith(PLATFORM_BRANDING_PREFIX)) {
      return c.json({ error: 'Forbidden: No tienes permiso para ver este archivo.' }, 403);
    }

    const file = await createR2Service(c.env).getFile(key);
    if (!file) return c.json({ error: 'Archivo no encontrado' }, 404);

    return new Response(file.bytes, {
      headers: {
        'content-type': file.contentType,
        'cache-control': 'private, max-age=300',
      },
    });
  })

  // DELETE /api/platform/upload?key=platform/branding/...
  .delete('/', requirePlatformAuth(), async (c) => {
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }
    if (!key.startsWith(PLATFORM_BRANDING_PREFIX)) {
      return c.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, 403);
    }

    const r2Service = createR2Service(c.env);
    await r2Service.deleteFile(key);
    return c.json({ success: true });
  })

  // PUT /api/platform/upload/direct?key=platform/branding/...
  .put('/direct', requirePlatformAuth(), async (c) => {
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }
    if (!key.startsWith(PLATFORM_BRANDING_PREFIX)) {
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

    const uniqueKey = constructStorageKey(
      PLATFORM_SCOPE,
      PLATFORM_BRANDING_FOLDER,
      body.filename,
      body.customName,
    );
    const r2Service = createR2Service(c.env);
    const requestUrl = new URL(c.req.url);
    const uploadBaseUrl = `${requestUrl.protocol}//${requestUrl.host}/api/platform/upload`;
    const result = await r2Service.getUploadUrl(uniqueKey, uploadBaseUrl);

    return c.json(result);
  });
