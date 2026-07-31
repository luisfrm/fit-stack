import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, authorizeUpload } from '../lib/route-handler';
import { createR2Service } from '../lib/r2';
import type { AppEnv } from '../lib/env';

function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) return 'bin';
  return filename.slice(lastDotIndex + 1);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 50);
}

function constructStorageKey(orgId: string, folder: string, filename: string, customName?: string): string {
  const extension = getFileExtension(filename);
  const baseName = customName || filename.slice(0, filename.lastIndexOf('.')) || filename;

  const slug = slugify(baseName);
  const shortId = crypto.randomUUID().split('-')[0];

  const folderPath = folder && folder !== 'general' ? `${folder}/` : '';
  return `cms/${orgId}/${folderPath}${slug}_${shortId}.${extension}`;
}

const presignedSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  folder: z.string().optional(),
  customName: z.string().optional(),
  organizationId: z.string().optional(),
});

export const uploadRoutes = new Hono<AppEnv>()
  // GET /api/upload?folder=
  .get('/', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const orgId = c.req.query('organizationId') || session.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: 'Organization ID is required' }, 400);
    }

    const folder = c.req.query('folder') || '';
    const folderPath = folder && folder !== 'general' ? `${folder}/` : '';
    const prefix = `cms/${orgId}/${folderPath}`;

    const r2Service = createR2Service(c.env);
    const files = await r2Service.listFiles(prefix);
    return c.json(files);
  })

  // DELETE /api/upload?key=cms/orgId/...
  .delete('/', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const orgId = c.req.query('organizationId') || session.activeOrganizationId;
    const key = c.req.query('key');

    if (!orgId || !key) {
      return c.json({ error: 'Key and Organization ID are required' }, 400);
    }

    if (!key.startsWith(`cms/${orgId}/`)) {
      return c.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, 403);
    }

    const r2Service = createR2Service(c.env);
    await r2Service.deleteFile(key);
    return c.json({ success: true });
  })

  // PUT /api/upload/direct?key=cms/orgId/...
  .put('/direct', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }

    const orgId = c.req.query('organizationId') || key.split('/')[1] || session.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: 'Organization ID is required' }, 400);
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

  // POST /api/upload/presigned
  .post('/presigned', requireAuth(), zValidator('json', presignedSchema), async (c) => {
    const session = c.get('session')!;
    const body = c.req.valid('json');
    const orgId = body.organizationId || session.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: 'Organization ID is required' }, 400);
    }

    const uniqueKey = constructStorageKey(orgId, body.folder || 'general', body.filename, body.customName);
    const r2Service = createR2Service(c.env);
    const requestUrl = new URL(c.req.url);
    const apiBaseUrl = `${requestUrl.protocol}//${requestUrl.host}/api`;
    const result = await r2Service.getUploadUrl(uniqueKey, apiBaseUrl);

    return c.json(result);
  });
