import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import {
  PERMISSION_MODULES as PM,
  PERMISSION_ACTIONS as PA,
  isOrgStorageKey,
} from '@workspace/shared';
import { createR2Service } from '../lib/r2';
import { constructStorageKey, orgStorageListPrefix } from '../lib/storage-keys';
import type { AppEnv } from '../lib/env';

/**
 * Uploads del PANEL — org-scoped.
 *
 * La organización sale SIEMPRE de la sesión (`c.get('orgId')`, resuelto por
 * `requireOrgPermission`): `organizationId` no existe en este contrato, así que
 * ningún cliente puede pedir la carpeta de otro gimnasio. Las claves viven bajo
 * `<orgId>/<folder>/…` y todo escritura/borrado exige ese prefijo.
 *
 * Los comprobantes emitidos (`receipts/<org>/…`) no son alcanzables desde aquí.
 */
const presignedSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.string().min(1),
    folder: z.string().optional(),
    customName: z.string().optional(),
  })
  .strict();

export const uploadRoutes = new Hono<AppEnv>()
  // GET /api/upload?folder=
  .get('/', requireOrgPermission(PM.MEMBERS, PA.CREATE), async (c) => {
    const orgId = c.get('orgId')!;
    const folder = c.req.query('folder');

    const r2Service = createR2Service(c.env);
    const files = await r2Service.listFiles(orgStorageListPrefix(orgId, folder));
    return c.json(files);
  })

  // GET /api/upload/file?key=<orgId>/... — entrega autenticada (avatares, logos,
  // evidencia de pago). Estos assets NO son públicos: se sirven por aquí.
  .get('/file', requireOrgPermission(PM.MEMBERS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const key = c.req.query('key');

    if (!key) return c.json({ error: 'Key is required' }, 400);
    if (!isOrgStorageKey(orgId, key)) {
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

  // DELETE /api/upload?key=<orgId>/...
  .delete('/', requireOrgPermission(PM.MEMBERS, PA.CREATE), async (c) => {
    const orgId = c.get('orgId')!;
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }
    if (!isOrgStorageKey(orgId, key)) {
      return c.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, 403);
    }

    const r2Service = createR2Service(c.env);
    await r2Service.deleteFile(key);
    return c.json({ success: true });
  })

  // PUT /api/upload/direct?key=<orgId>/...
  .put('/direct', requireOrgPermission(PM.MEMBERS, PA.CREATE), async (c) => {
    const orgId = c.get('orgId')!;
    const key = c.req.query('key');

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }
    if (!isOrgStorageKey(orgId, key)) {
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

  // POST /api/upload/presigned
  .post('/presigned', requireOrgPermission(PM.MEMBERS, PA.CREATE), zValidator('json', presignedSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const body = c.req.valid('json');

    const uniqueKey = constructStorageKey(orgId, body.folder, body.filename, body.customName);
    const r2Service = createR2Service(c.env);
    const requestUrl = new URL(c.req.url);
    const uploadBaseUrl = `${requestUrl.protocol}//${requestUrl.host}/api/upload`;
    const result = await r2Service.getUploadUrl(uniqueKey, uploadBaseUrl);

    return c.json(result);
  });
