/**
 * Knowledge Base (RAG) integration tests — /api/platform/knowledge.
 *
 * Cubre: guards de auth (401/403), validaciones Zod, degradación 503 sin
 * credenciales Workers AI, PATCH sin re-embed (título/isActive), DELETE con
 * cascade y visibilidad plataforma-vs-org en el listado.
 *
 * El env de tests no incluye CLOUDFLARE_AI ni OPENROUTER a propósito
 * (helpers/env.ts), así que los flujos que requieren embeddings reales se
 * validan como 503 — determinista y sin deps externas.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { testQuery, skipReason, truncateAll } from '../helpers/db';
import {
  registerPlatformUser,
  createGymTenant,
  uid,
  type AuthedUser,
} from '../helpers/auth';

async function insertDoc(opts: {
  organizationId?: string | null;
  title: string;
  content?: string;
}): Promise<string> {
  const rows = await testQuery<{ id: string }>(
    `INSERT INTO ai_knowledge_document (id, organization_id, title, source, content)
     VALUES ($1, $2, $3, 'faq', $4) RETURNING id`,
    [
      `kbdoc-${uid()}`,
      opts.organizationId ?? null,
      opts.title,
      opts.content ?? 'Contenido de prueba para la base de conocimiento.',
    ],
  );
  return rows[0]!.id;
}

describe.skipIf(skipReason !== null)('Knowledge Base (RAG)', () => {
  let admin: AuthedUser;
  let support: AuthedUser;

  beforeAll(async () => {
    await truncateAll();
    admin = await registerPlatformUser('admin');
    support = await registerPlatformUser('support');
  });

  describe('Auth guards', () => {
    it('401 sin sesión', async () => {
      const res = await admin.client.get('/api/platform/knowledge', { anonymous: true });
      expect(res.status).toBe(401);
    });

    it('403 support (read-only) al crear', async () => {
      const res = await support.client.post('/api/platform/knowledge', {
        title: 'No permitido',
        content: 'contenido',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Validaciones Zod', () => {
    it('400 title vacío', async () => {
      const res = await admin.client.post('/api/platform/knowledge', {
        title: '',
        content: 'contenido válido',
      });
      expect(res.status).toBe(400);
    });

    it('400 source inválido', async () => {
      const res = await admin.client.post('/api/platform/knowledge', {
        title: 'Título ok',
        source: 'invalido',
        content: 'contenido',
      });
      expect(res.status).toBe(400);
    });

    it('400 content > 20000 chars', async () => {
      const res = await admin.client.post('/api/platform/knowledge', {
        title: 'Título ok',
        content: 'x'.repeat(20_001),
      });
      expect(res.status).toBe(400);
    });

    it('400 body vacío', async () => {
      const res = await admin.client.post('/api/platform/knowledge', {});
      expect(res.status).toBe(400);
    });
  });

  describe('Degradación sin credenciales Workers AI', () => {
    it('POST → 503 cuando faltan credenciales de embedding', async () => {
      const res = await admin.client.post('/api/platform/knowledge', {
        title: 'Créditos IA',
        source: 'faq',
        content: '1 crédito equivale a 1000 tokens del chat IA.',
      });
      expect(res.status).toBe(503);
      expect(res.body?.error).toBeTruthy();
    });

    it('PATCH con cambio de contenido → 503; solo título/isActive → funciona sin embeddings', async () => {
      const id = await insertDoc({ title: 'Original', content: 'Contenido v1.' });

      const patchContent = await admin.client.patch(`/api/platform/knowledge/${id}`, {
        content: 'Contenido v2 distinto.',
      });
      expect(patchContent.status).toBe(503);

      const patchTitle = await admin.client.patch(`/api/platform/knowledge/${id}`, {
        title: 'Actualizado',
        isActive: false,
      });
      expect(patchTitle.status).toBe(200);
      expect(patchTitle.body?.data?.title).toBe('Actualizado');
      expect(patchTitle.body?.data?.isActive).toBe(false);

      const dbRow = await testQuery<{ content: string }>(
        `SELECT content FROM ai_knowledge_document WHERE id = $1`,
        [id],
      );
      expect(dbRow[0]?.content).toBe('Contenido v1.');
    });

    it('GET :id inexistente → error normalizado', async () => {
      const res = await admin.client.get(`/api/platform/knowledge/no-existe-${uid()}`);
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('Listado y aislamiento plataforma vs org', () => {
    it('GET lista solo documentos de plataforma; los de org no aparecen', async () => {
      const tenant = await createGymTenant(`kbiso-${uid()}`);
      const platformId = await insertDoc({ title: 'FAQ global FitStack' });
      await insertDoc({
        organizationId: tenant.organization.id,
        title: 'Reglas internas gym',
      });

      const res = await admin.client.get('/api/platform/knowledge');
      expect(res.status).toBe(200);
      const docs = res.body?.data as { id: string; organizationId: string | null }[];
      const ids = docs.map((d) => d.id);
      expect(ids).toContain(platformId);
      for (const d of docs) {
        expect(d.organizationId).toBeNull();
      }
    });

    it('DELETE elimina documento y chunks en cascade', async () => {
      const id = await insertDoc({ title: 'Para borrar' });
      await testQuery(
        `INSERT INTO ai_knowledge_chunk (id, document_id, content, embedding, model)
         VALUES ($1, $2, 'chunk', array_fill(0.1, ARRAY[1024])::vector, 'test-model')`,
        [`kbchunk-${uid()}`, id],
      );

      const del = await admin.client.delete(`/api/platform/knowledge/${id}`);
      expect(del.status).toBe(200);

      const doc = await testQuery(`SELECT id FROM ai_knowledge_document WHERE id = $1`, [id]);
      expect(doc).toHaveLength(0);
      const chunks = await testQuery(
        `SELECT id FROM ai_knowledge_chunk WHERE document_id = $1`,
        [id],
      );
      expect(chunks).toHaveLength(0);
    });

    it('searchSimilar respeta el filtro de org (SQL directo)', async () => {
      const tenant = await createGymTenant(`kbrag-${uid()}`);
      const otherTenant = await createGymTenant(`kbragother-${uid()}`);
      const orgId = tenant.organization.id;

      const vecA = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
      const vecB = `[${Array.from({ length: 1024 }, (_, i) => (i === 1 ? 1 : 0)).join(',')}]`;
      const queryVec = vecA;

      await testQuery(
        `INSERT INTO ai_knowledge_document (id, organization_id, title, source, content) VALUES ($1, $2, 'doc propio', 'faq', 'propio')`,
        [`kbdoc-${uid()}`, orgId],
      );
      await testQuery(
        `INSERT INTO ai_knowledge_document (id, organization_id, title, source, content) VALUES ($1, NULL, 'faq global', 'faq', 'global')`,
        [`kbdoc-${uid()}`],
      );
      await testQuery(
        `INSERT INTO ai_knowledge_document (id, organization_id, title, source, content) VALUES ($1, $2, 'doc ajeno', 'faq', 'ajeno')`,
        [`kbdoc-${uid()}`, otherTenant.organization.id],
      );
      const docs = await testQuery<{ id: string; title: string }>(
        `SELECT id, title FROM ai_knowledge_document WHERE title IN ('doc propio','faq global','doc ajeno')`,
      );
      const byTitle = Object.fromEntries(docs.map((r) => [r.title, r.id]));
      for (const [title, vec] of [
        ['doc propio', vecA],
        ['faq global', vecA],
        ['doc ajeno', vecB],
      ] as const) {
        await testQuery(
          `INSERT INTO ai_knowledge_chunk (id, document_id, content, embedding, model) VALUES ($1, $2, $3, $4::vector, 'test')`,
          [`kbchunk-${uid()}`, byTitle[title], title, vec],
        );
      }

      const rows = await testQuery<{ content: string; similarity: number }>(
        `SELECT c.content, 1 - (c.embedding <=> $1::vector) AS similarity
         FROM ai_knowledge_chunk c
         JOIN ai_knowledge_document d ON d.id = c.document_id
         WHERE d.is_active AND (d.organization_id IS NULL OR d.organization_id = $2)
         ORDER BY c.embedding <=> $1::vector ASC LIMIT 4`,
        [queryVec, orgId],
      );
      const contents = rows.map((r) => r.content).sort();
      expect(contents).toEqual(['doc propio', 'faq global']);
    });
  });
});
