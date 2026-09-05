/**
 * CMS integration tests.
 *
 * Covers the full page/block lifecycle of the api-worker CMS routes:
 * page CRUD + slug uniqueness, block creation (displayOrder auto-computed),
 * the reorder endpoint (serverless-safe two-phase update), permission
 * enforcement and organization isolation.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  addUserToOrganization,
  registerPlatformUser,
  uid,
  type AuthedUser,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';

/**
 * The CMS routes are feature-gated (`requireFeature('cms')`). Test tenants
 * have no platform subscription, so we enable the free tier including `cms`
 * (platform-wide setting) — every tenant then resolves the feature.
 */
async function enableCmsFreeTier(admin: AuthedUser): Promise<void> {
  const res = await admin.client.post('/api/platform/settings', {
    feature_flags_free_tier_enabled: 'true',
    feature_flags_free_tier: JSON.stringify({
      panel: { enabled: true },
      cms: { enabled: true },
      members_portal: { enabled: true, limits: { member_seats: 50 } },
      ai_chat: { enabled: true, limits: { ai_credits_monthly: 500 } },
    }),
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`enable cms free tier failed (${res.status}): ${res.text}`);
  }
}

describe.skipIf(skipReason !== null)('CMS API', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    const admin = await registerPlatformUser('admin');
    await enableCmsFreeTier(admin);
  });

  describe('Pages', () => {
    it('creates a page', async () => {
      const { owner } = await createGymTenant();
      const slug = `inicio-${uid()}`;
      const res = await owner.client.post('/api/cms/pages', {
        slug,
        title: 'Inicio',
        description: 'Página de inicio',
        isActive: true,
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.slug).toBe(slug);
      expect(res.body.isActive).toBe(true);
    });

    it('rejects page creation with missing title', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.post('/api/cms/pages', {
        slug: `sin-titulo-${uid()}`,
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects duplicate slug within the same organization', async () => {
      const { owner } = await createGymTenant();
      const slug = `duplicado-${uid()}`;
      await owner.client.post('/api/cms/pages', { slug, title: 'Primera' });

      const res = await owner.client.post('/api/cms/pages', { slug, title: 'Segunda' });
      expect(res.status, res.text).toBe(400);
    });

    it('allows the same slug in different organizations', async () => {
      const t1 = await createGymTenant('cms-slug-a');
      const t2 = await createGymTenant('cms-slug-b');
      const slug = `compartido-${uid()}`;

      await t1.owner.client.post('/api/cms/pages', { slug, title: 'A' });
      const res = await t2.owner.client.post('/api/cms/pages', { slug, title: 'B' });

      expect(res.status, res.text).toBe(201);
    });

    it('rejects unauthenticated page creation', async () => {
      const client = createClient();
      const res = await client.post('/api/cms/pages', {
        slug: `anon-${uid()}`,
        title: 'Anónimo',
      }, { anonymous: true });

      expect(res.status, res.text).toBe(401);
    });

    it('lists pages', async () => {
      const { owner } = await createGymTenant();
      await owner.client.post('/api/cms/pages', { slug: `list-a-${uid()}`, title: 'A' });
      await owner.client.post('/api/cms/pages', { slug: `list-b-${uid()}`, title: 'B' });

      const res = await owner.client.get('/api/cms/pages');
      expect(res.status, res.text).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('gets a page by id', async () => {
      const { owner } = await createGymTenant();
      const created = await owner.client.post('/api/cms/pages', {
        slug: `get-${uid()}`,
        title: 'Gettable',
      });

      const res = await owner.client.get(`/api/cms/pages/${created.body.id}`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it('returns 404 for a page that does not exist', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.get('/api/cms/pages/999999');
      expect(res.status, res.text).toBe(404);
    });

    it('updates a page title', async () => {
      const { owner } = await createGymTenant();
      const created = await owner.client.post('/api/cms/pages', {
        slug: `update-${uid()}`,
        title: 'Antes',
      });

      const res = await owner.client.put(`/api/cms/pages/${created.body.id}`, {
        title: 'Después',
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.title).toBe('Después');
    });

    it('stores and updates SEO metadata (metaTitle, metaDescription)', async () => {
      const { owner } = await createGymTenant();
      const created = await owner.client.post('/api/cms/pages', {
        slug: `seo-${uid()}`,
        title: 'Inicio',
        metaTitle: 'Gimnasio Premium | Inicio',
        metaDescription: 'Entrena con los mejores entrenadores.',
      });

      expect(created.status, created.text).toBe(201);
      expect(created.body.metaTitle).toBe('Gimnasio Premium | Inicio');
      expect(created.body.metaDescription).toBe('Entrena con los mejores entrenadores.');

      const get = await owner.client.get(`/api/cms/pages/${created.body.id}`);
      expect(get.body.metaTitle).toBe('Gimnasio Premium | Inicio');

      // Clear a field with null and confirm it persists.
      const upd = await owner.client.put(`/api/cms/pages/${created.body.id}`, {
        metaTitle: null,
        metaDescription: 'Nueva descripción SEO',
      });
      expect(upd.status, upd.text).toBe(200);
      expect(upd.body.metaTitle).toBeNull();
      expect(upd.body.metaDescription).toBe('Nueva descripción SEO');
    });

    it('rejects updating to a slug already used by another page', async () => {
      const { owner } = await createGymTenant();
      const pageA = await owner.client.post('/api/cms/pages', { slug: `slug-a-${uid()}`, title: 'A' });
      const pageB = await owner.client.post('/api/cms/pages', { slug: `slug-b-${uid()}`, title: 'B' });

      const res = await owner.client.put(`/api/cms/pages/${pageB.body.id}`, {
        slug: pageA.body.slug,
      });

      expect(res.status, res.text).toBe(400);
    });

    it('allows keeping the same slug when updating the same page', async () => {
      const { owner } = await createGymTenant();
      const created = await owner.client.post('/api/cms/pages', {
        slug: `keep-${uid()}`,
        title: 'A',
      });

      const res = await owner.client.put(`/api/cms/pages/${created.body.id}`, {
        slug: created.body.slug,
        title: 'B',
      });
      expect(res.status, res.text).toBe(200);
      expect(res.body.slug).toBe(created.body.slug);
    });

    it('deletes a page and its blocks', async () => {
      const { owner } = await createGymTenant();
      const created = await owner.client.post('/api/cms/pages', {
        slug: `delete-${uid()}`,
        title: 'Borrame',
      });
      const block = await owner.client.post('/api/cms/blocks', {
        pageId: created.body.id,
        blockType: 'hero',
        data: { title: 'Hola' },
      });
      expect(block.status, block.text).toBe(201);

      const del = await owner.client.delete(`/api/cms/pages/${created.body.id}`);
      expect(del.status, del.text).toBe(200);

      const get = await owner.client.get(`/api/cms/pages/${created.body.id}`);
      expect(get.status, get.text).toBe(404);
    });
  });

  describe('Blocks', () => {
    it('creates a block at POST /api/cms/blocks with pageId in the body', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `block-page-${uid()}`,
        title: 'Con bloques',
      });

      const res = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: 'Hero Principal' },
      });

      expect(res.status, res.text).toBe(201);
      expect(res.body.pageId).toBe(page.body.id);
      expect(res.body.blockType).toBe('hero');
      expect(res.body.displayOrder).toBe(0);
      expect(res.body.isVisible).toBe(true);
    });

    it('assigns incremental displayOrder when omitted (max + 1, gap-safe)', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `orders-${uid()}`,
        title: 'Órdenes',
      });

      const b1 = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: 'Uno' },
      });
      const b2 = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'services',
        data: { title: 'Servicios', items: [] },
      });
      expect(b1.body.displayOrder).toBe(0);
      expect(b2.body.displayOrder).toBe(1);

      // Delete the first block to create a gap, then create a new one:
      // displayOrder must be max(existing) + 1 = 2, never a raw count (1).
      await owner.client.delete(`/api/cms/blocks/${b1.body.id}`);
      const b3 = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'contact',
        data: {},
      });

      expect(b3.body.displayOrder).toBe(2);
    });

    it('validates block data with the shared zod schemas', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `validate-${uid()}`,
        title: 'Validación',
      });

      // hero requires a non-empty title
      const bad = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: '' },
      });
      expect(bad.status, bad.text).toBe(400);

      // unknown block type is rejected by zod enum
      const unknown = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'nope',
        data: { title: 'X' },
      });
      expect(unknown.status, unknown.text).toBe(400);
    });

    it('lists blocks ordered by displayOrder', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `list-blocks-${uid()}`,
        title: 'Lista bloques',
      });

      await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'hero', data: { title: 'H' } });
      await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'team', data: { title: 'T' } });

      const res = await owner.client.get(`/api/cms/pages/${page.body.id}/blocks`);
      expect(res.status, res.text).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].blockType).toBe('hero');
      expect(res.body[1].blockType).toBe('team');
    });

    it('updates a block', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `update-block-${uid()}`,
        title: 'Actualizar bloque',
      });
      const block = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: 'Antes' },
      });

      const res = await owner.client.put(`/api/cms/blocks/${block.body.id}`, {
        data: { title: 'Después', subtitle: 'Nuevo' },
        isVisible: false,
      });

      expect(res.status, res.text).toBe(200);
      expect(res.body.data.title).toBe('Después');
      expect(res.body.data.subtitle).toBe('Nuevo');
      expect(res.body.isVisible).toBe(false);
    });

    it('returns 404 updating a block that does not exist', async () => {
      const { owner } = await createGymTenant();
      const res = await owner.client.put('/api/cms/blocks/999999', {
        data: { title: 'X' },
      });
      expect(res.status, res.text).toBe(404);
    });

    it('deletes a block', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `del-block-${uid()}`,
        title: 'Borrar bloque',
      });
      const block = await owner.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: 'X' },
      });

      const del = await owner.client.delete(`/api/cms/blocks/${block.body.id}`);
      expect(del.status, del.text).toBe(200);

      const list = await owner.client.get(`/api/cms/pages/${page.body.id}/blocks`);
      expect(list.body.length).toBe(0);
    });
  });

  describe('Reorder', () => {
    it('reorders blocks without violating the unique index (swap)', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `reorder-${uid()}`,
        title: 'Reordenar',
      });

      const hero = await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'hero', data: { title: 'H' } });
      const team = await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'team', data: { title: 'T' } });
      const contact = await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'contact', data: {} });

      // Reverse the order: contact(2) → 0, team(1) → 1, hero(0) → 2
      const res = await owner.client.put(`/api/cms/pages/${page.body.id}/blocks/reorder`, {
        orders: [
          { id: contact.body.id, displayOrder: 0 },
          { id: team.body.id, displayOrder: 1 },
          { id: hero.body.id, displayOrder: 2 },
        ],
      });

      expect(res.status, res.text).toBe(200);

      const list = await owner.client.get(`/api/cms/pages/${page.body.id}/blocks`);
      expect(list.body.map((b: any) => b.blockType)).toEqual(['contact', 'team', 'hero']);
      expect(list.body.map((b: any) => b.displayOrder)).toEqual([0, 1, 2]);
    });

    it('rejects reorder payloads with unknown block ids', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `reorder-invalid-${uid()}`,
        title: 'Reorden inválido',
      });
      const hero = await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'hero', data: { title: 'H' } });

      const res = await owner.client.put(`/api/cms/pages/${page.body.id}/blocks/reorder`, {
        orders: [
          { id: hero.body.id, displayOrder: 0 },
          { id: 999999, displayOrder: 1 }, // does not belong to the page
        ],
      });

      expect(res.status, res.text).toBe(400);
    });

    it('rejects reorder payloads with duplicated ids', async () => {
      const { owner } = await createGymTenant();
      const page = await owner.client.post('/api/cms/pages', {
        slug: `reorder-dupe-${uid()}`,
        title: 'Reorden duplicado',
      });
      const hero = await owner.client.post('/api/cms/blocks', { pageId: page.body.id, blockType: 'hero', data: { title: 'H' } });

      const res = await owner.client.put(`/api/cms/pages/${page.body.id}/blocks/reorder`, {
        orders: [
          { id: hero.body.id, displayOrder: 0 },
          { id: hero.body.id, displayOrder: 1 },
        ],
      });

      expect(res.status, res.text).toBe(400);
    });
  });

  describe('Permissions', () => {
    it('rejects page creation by a member (CONTENT.CREATE required)', async () => {
      const { organization } = await createGymTenant();
      const member = await addUserToOrganization(organization.id, ORG_ROLES.MEMBER, 'cms-member');
      const res = await member.client.post('/api/cms/pages', {
        slug: `member-page-${uid()}`,
        title: 'Miembro',
      });

      expect(res.status, res.text).toBe(403);
    });

    it('rejects block creation by a cashier', async () => {
      const { organization, owner } = await createGymTenant();
      const cashier = await addUserToOrganization(organization.id, ORG_ROLES.CASHIER, 'cms-cashier');

      const page = await owner.client.post('/api/cms/pages', {
        slug: `cashier-page-${uid()}`,
        title: 'Cajero',
      });
      const res = await cashier.client.post('/api/cms/blocks', {
        pageId: page.body.id,
        blockType: 'hero',
        data: { title: 'X' },
      });

      expect(res.status, res.text).toBe(403);
    });

    it('allows a coach to read pages', async () => {
      const { organization, owner } = await createGymTenant();
      const coach = await addUserToOrganization(organization.id, ORG_ROLES.COACH, 'cms-coach');

      await owner.client.post('/api/cms/pages', { slug: `coach-page-${uid()}`, title: 'Coach' });
      const res = await coach.client.get('/api/cms/pages');
      expect(res.status, res.text).toBe(200);
    });
  });

  describe('Organization isolation', () => {
    it('org A cannot see org B pages', async () => {
      const t1 = await createGymTenant('cms-iso-a');
      const t2 = await createGymTenant('cms-iso-b');

      await t1.owner.client.post('/api/cms/pages', { slug: `iso-a-${uid()}`, title: 'A' });
      await t2.owner.client.post('/api/cms/pages', { slug: `iso-b-${uid()}`, title: 'B' });

      const res1 = await t1.owner.client.get('/api/cms/pages');
      const res2 = await t2.owner.client.get('/api/cms/pages');

      expect(res1.body.every((p: any) => p.slug.startsWith('iso-a'))).toBe(true);
      expect(res2.body.every((p: any) => p.slug.startsWith('iso-b'))).toBe(true);
    });

    it('org A cannot update or delete org B page/blocks', async () => {
      const t1 = await createGymTenant('cms-x-a');
      const t2 = await createGymTenant('cms-x-b');

      const pageB = await t2.owner.client.post('/api/cms/pages', { slug: `x-b-${uid()}`, title: 'B' });
      const blockB = await t2.owner.client.post('/api/cms/blocks', {
        pageId: pageB.body.id,
        blockType: 'hero',
        data: { title: 'Bloque B' },
      });

      const upd = await t1.owner.client.put(`/api/cms/pages/${pageB.body.id}`, { title: 'Hackeada' });
      expect(upd.status, upd.text).toBe(404);

      const blockUpd = await t1.owner.client.put(`/api/cms/blocks/${blockB.body.id}`, { data: { title: 'Hackeada' } });
      expect(blockUpd.status, blockUpd.text).toBe(404);

      const del = await t1.owner.client.delete(`/api/cms/pages/${pageB.body.id}`);
      expect(del.status, del.text).toBe(404);
    });
  });
});