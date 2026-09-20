/**
 * Storage isolation tests — the two halves of the file policy:
 *
 *  1. ESCRITURA (org-scoped): `/api/upload/*` resuelve la organización desde la
 *     sesión (nunca por query/body), exige permiso de organización y valida que
 *     la key caiga bajo `<orgId>/`. `/api/platform/organizations/:orgId/upload/*`
 *     recibe la org por PATH con permiso de plataforma.
 *  2. LECTURA pública: `/api/public/files/*` sirve SOLO los assets del sitio
 *     (`<orgId>/cms/…`) y el branding de la plataforma. Todo lo demás responde
 *     404 y se entrega por las rutas autenticadas (`/api/upload/file`).
 *
 * Nota sobre los spies: cada `TestClient` tiene su propio `Env` (y por tanto su
 * propio bucket de R2). Las lecturas "públicas" se hacen con el MISMO cliente
 * que subió el archivo, pero `anonymous: true` — así la única diferencia con la
 * petición autenticada es la ausencia de cookie.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  addUserToOrganization,
  createGymTenant,
  registerPlatformUser,
  registerUser,
  uniqueEmail,
  type AuthedUser,
  type GymTenant,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Storage isolation (org scope + public policy)', () => {
  let tenantA: GymTenant;
  let tenantB: GymTenant;
  let cashier: AuthedUser;
  let coach: AuthedUser;
  let noOrgUser: AuthedUser;
  let platformAdmin: AuthedUser;
  let platformSupport: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    // Un tenant por organización: el aislamiento es entre organizaciones, no
    // entre roles (esa matriz la completa guards.test.ts).
    tenantA = await createGymTenant('storage-a');
    tenantB = await createGymTenant('storage-b');

    cashier = await addUserToOrganization(tenantA.organization.id, ORG_ROLES.CASHIER, 'storage-cashier');
    coach = await addUserToOrganization(tenantA.organization.id, ORG_ROLES.COACH, 'storage-coach');
    noOrgUser = await registerUser({ email: uniqueEmail('storage-noorg') });

    platformAdmin = await registerPlatformUser('admin');
    platformSupport = await registerPlatformUser('support');
  }, 120_000);

  /** Sin sesión, sobre el mismo `Env` (mismo bucket): ¿esto es público? */
  function publicGet(client: TestClient, path: string) {
    return client.get(path, { anonymous: true });
  }

  /** Sube un archivo por el flujo real (presigned + direct) y devuelve su key. */
  async function uploadVia(client: TestClient, folder: string | undefined): Promise<string> {
    const presigned = await client.post('/api/upload/presigned', {
      filename: 'foto.png',
      contentType: 'image/png',
      folder,
      customName: 'foto',
    });
    expect(presigned.status, presigned.text).toBe(200);

    const key = presigned.body.key as string;
    const direct = await client.put('/api/upload/direct', 'fake-bytes', {
      query: { key },
      headers: { 'content-type': 'image/png' },
    });
    expect(direct.status, direct.text).toBe(200);

    return key;
  }

  describe('escritura org-scoped (panel)', () => {
    it('guarda bajo `<orgId>/` de la SESIÓN (organizationId no está en el contrato)', async () => {
      const presigned = await tenantA.owner.client.post('/api/upload/presigned', {
        filename: 'foto.png',
        contentType: 'image/png',
        folder: 'cms',
      });

      expect(presigned.status, presigned.text).toBe(200);
      expect(presigned.body.key).toMatch(
        new RegExp(`^${tenantA.organization.id}/cms/foto_[a-f0-9]+\\.png$`),
      );

      // Un cliente viejo que intente apuntar a otra organización no puede
      // hacerlo ni en silencio: el parámetro no existe.
      const withOrgParam = await tenantA.owner.client.post('/api/upload/presigned', {
        filename: 'foto.png',
        contentType: 'image/png',
        organizationId: tenantB.organization.id,
      });

      expect(withOrgParam.status, withOrgParam.text).toBe(400);
    });

    it('permite el flujo completo a un cashier (members.create)', async () => {
      const key = await uploadVia(cashier.client, 'receipts');
      expect(key.startsWith(`${tenantA.organization.id}/`)).toBe(true);
    });

    it('niega a un coach (no tiene permisos de subida)', async () => {
      const res = await coach.client.post('/api/upload/presigned', {
        filename: 'foto.png',
        contentType: 'image/png',
      });

      expect(res.status, res.text).toBe(403);
    });

    it('exige una organización activa (sin fallback silencioso a la del query)', async () => {
      const res = await noOrgUser.client.get('/api/upload', {
        query: { organizationId: tenantB.organization.id },
      });

      expect(res.status, res.text).toBe(400);
    });

    it('lista solo los archivos de su organización', async () => {
      const keyA = await uploadVia(tenantA.owner.client, 'cms');
      await uploadVia(tenantB.owner.client, 'cms');

      const listA = await tenantA.owner.client.get('/api/upload', { query: { folder: 'cms' } });
      expect(listA.status, listA.text).toBe(200);

      const keysA = (listA.body as Array<{ key: string }>).map((f) => f.key);
      expect(keysA).toContain(keyA);
      expect(keysA.every((k) => k.startsWith(`${tenantA.organization.id}/`))).toBe(true);
    });

    it('no puede borrar ni sobrescribir una key de otra organización', async () => {
      const victimKey = await uploadVia(tenantB.owner.client, 'cms');
      const originalBody = tenantB.owner.client.r2.objects.get(victimKey)?.body;

      const del = await tenantA.owner.client.delete('/api/upload', { query: { key: victimKey } });
      expect(del.status, del.text).toBe(403);
      expect(tenantB.owner.client.r2.objects.has(victimKey)).toBe(true);

      const overwrite = await tenantA.owner.client.put('/api/upload/direct', 'hijacked', {
        query: { key: victimKey },
        headers: { 'content-type': 'image/png' },
      });
      expect(overwrite.status, overwrite.text).toBe(403);
      expect(tenantB.owner.client.r2.objects.get(victimKey)?.body).toBe(originalBody);
    });

    it('no puede escapar del prefijo con una carpeta con `../`', async () => {
      const res = await tenantA.owner.client.post('/api/upload/presigned', {
        filename: 'foto.png',
        contentType: 'image/png',
        folder: '../../',
      });

      expect(res.status, res.text).toBe(200);
      // La carpeta se sanea: la key sigue viviendo dentro de la organización.
      expect(res.body.key.startsWith(`${tenantA.organization.id}/`)).toBe(true);
      expect(res.body.key).not.toContain('..');
    });
  });

  describe('lectura pública (allowlist)', () => {
    it('sirve los assets del sitio (`<orgId>/cms/…`) sin sesión', async () => {
      const key = await uploadVia(tenantA.owner.client, 'cms');

      const res = await publicGet(tenantA.owner.client, `/api/public/files/${key}`);
      expect(res.status, res.text).toBe(200);
    });

    it('no expone la evidencia de pago ni los avatares de la organización', async () => {
      const receiptEvidence = await uploadVia(tenantA.owner.client, 'receipts');
      const avatar = await uploadVia(tenantA.owner.client, undefined);

      for (const key of [receiptEvidence, avatar]) {
        const res = await publicGet(tenantA.owner.client, `/api/public/files/${key}`);
        expect(res.status, `key=${key}`).toBe(404);

        // …pero la organización sí los ve por la ruta autenticada.
        const authed = await tenantA.owner.client.get('/api/upload/file', { query: { key } });
        expect(authed.status, authed.text).toBe(200);
      }
    });

    it('no expone comprobantes (org ni SaaS) ni claves legacy `cms/<orgId>/…`', async () => {
      // Los comprobantes los escribe el renderer directamente en R2.
      const bucket = tenantA.owner.client.r2.objects;
      bucket.set(`${tenantA.organization.id}/receipts/2026/1.pdf`, { body: 'pdf' });
      bucket.set('receipts/legacy-gym/2026/1.pdf', { body: 'pdf' });
      bucket.set('platform/receipts/2026/FS-1.pdf', { body: 'pdf' });
      bucket.set(`cms/${tenantA.organization.id}/legacy.png`, { body: 'png' });

      for (const key of [
        `${tenantA.organization.id}/receipts/2026/1.pdf`,
        'receipts/legacy-gym/2026/1.pdf',
        'platform/receipts/2026/FS-1.pdf',
        `cms/${tenantA.organization.id}/legacy.png`,
      ]) {
        const res = await publicGet(tenantA.owner.client, `/api/public/files/${key}`);
        expect(res.status, `key=${key}`).toBe(404);
      }
    });

    it('sirve el branding de la plataforma (login sin sesión)', async () => {
      tenantA.owner.client.r2.objects.set('platform/branding/logo_abc.png', { body: 'logo' });

      const res = await publicGet(
        tenantA.owner.client,
        '/api/public/files/platform/branding/logo_abc.png',
      );
      expect(res.status, res.text).toBe(200);
      expect(res.text).toContain('logo');
    });
  });

  describe('assets de organización desde el console (org por path)', () => {
    it('sube a la organización indicada en el path', async () => {
      const presigned = await platformAdmin.client.post(
        `/api/platform/organizations/${tenantA.organization.id}/upload/presigned`,
        { filename: 'logo.png', contentType: 'image/png', customName: 'logo' },
      );

      expect(presigned.status, presigned.text).toBe(200);
      expect(presigned.body.key).toMatch(
        new RegExp(`^${tenantA.organization.id}/logo_[a-f0-9]+\\.png$`),
      );
    });

    it('rechaza `support` (solo lectura) y las organizaciones inexistentes', async () => {
      const support = await platformSupport.client.post(
        `/api/platform/organizations/${tenantA.organization.id}/upload/presigned`,
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(support.status, support.text).toBe(403);

      const missing = await platformAdmin.client.post(
        '/api/platform/organizations/no-existe/upload/presigned',
        { filename: 'logo.png', contentType: 'image/png' },
      );
      expect(missing.status, missing.text).toBe(404);
    });

    it('no permite escribir una key de otra organización desde el path de una', async () => {
      const foreignKey = `${tenantB.organization.id}/logo_abc.png`;

      const res = await platformAdmin.client.put(
        `/api/platform/organizations/${tenantA.organization.id}/upload/direct`,
        'hijacked',
        { query: { key: foreignKey }, headers: { 'content-type': 'image/png' } },
      );

      expect(res.status, res.text).toBe(403);
    });

    it('el scope de branding no alcanza el namespace de comprobantes SaaS', async () => {
      const res = await platformAdmin.client.delete('/api/platform/upload', {
        query: { key: 'platform/receipts/2026/FS-1.pdf' },
      });

      expect(res.status, res.text).toBe(403);
    });

    it('entrega el logo de la organización solo de forma autenticada', async () => {
      const presigned = await platformAdmin.client.post(
        `/api/platform/organizations/${tenantA.organization.id}/upload/presigned`,
        { filename: 'logo.png', contentType: 'image/png', customName: 'logo' },
      );
      const key = presigned.body.key as string;

      await platformAdmin.client.put(
        `/api/platform/organizations/${tenantA.organization.id}/upload/direct`,
        'logo-bytes',
        { query: { key }, headers: { 'content-type': 'image/png' } },
      );

      const file = await platformAdmin.client.get(
        `/api/platform/organizations/${tenantA.organization.id}/upload/file`,
        { query: { key } },
      );
      expect(file.status, file.text).toBe(200);

      const publicRes = await publicGet(platformAdmin.client, `/api/public/files/${key}`);
      expect(publicRes.status).toBe(404);
    });
  });
});
