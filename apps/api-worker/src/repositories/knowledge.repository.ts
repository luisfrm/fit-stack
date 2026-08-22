import { eq, and, sql, isNull, or, desc, cosineDistance } from 'drizzle-orm';
import type { Db } from '@workspace/database/factory';
import { aiKnowledgeChunk, aiKnowledgeDocument } from '@workspace/database/schema';

export interface KnowledgeDocDto {
  id: string;
  organizationId: string | null;
  title: string;
  source: string;
  isActive: boolean;
  contentLength: number;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeDocDetail extends KnowledgeDocDto {
  content: string;
  chunks: { id: string; content: string }[];
}

export interface KnowledgeChunkInput {
  content: string;
  embedding: number[];
  model: string;
}

export interface SimilarChunk {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
}

export function createKnowledgeRepository(db: Db) {
  return {
    async list(organizationId?: string | null): Promise<KnowledgeDocDto[]> {
      const rows = await db
        .select({
          id: aiKnowledgeDocument.id,
          organizationId: aiKnowledgeDocument.organizationId,
          title: aiKnowledgeDocument.title,
          source: aiKnowledgeDocument.source,
          isActive: aiKnowledgeDocument.isActive,
          contentLength: sql<number>`length(${aiKnowledgeDocument.content})`,
          chunkCount: sql<number>`(
            select count(*)::int from ${aiKnowledgeChunk}
            where ${aiKnowledgeChunk.documentId} = ${aiKnowledgeDocument.id}
          )`,
          createdAt: aiKnowledgeDocument.createdAt,
          updatedAt: aiKnowledgeDocument.updatedAt,
        })
        .from(aiKnowledgeDocument)
        .where(
          organizationId
            ? or(isNull(aiKnowledgeDocument.organizationId), eq(aiKnowledgeDocument.organizationId, organizationId))
            : isNull(aiKnowledgeDocument.organizationId),
        )
        .orderBy(desc(aiKnowledgeDocument.updatedAt));
      return rows.map((r) => ({ ...r, contentLength: Number(r.contentLength), chunkCount: Number(r.chunkCount) }));
    },

    async getById(id: string): Promise<KnowledgeDocDetail | null> {
      const [doc] = await db
        .select()
        .from(aiKnowledgeDocument)
        .where(eq(aiKnowledgeDocument.id, id));
      if (!doc) return null;
      const chunks = await db
        .select({ id: aiKnowledgeChunk.id, content: aiKnowledgeChunk.content })
        .from(aiKnowledgeChunk)
        .where(eq(aiKnowledgeChunk.documentId, id))
        .orderBy(aiKnowledgeChunk.createdAt);
      return {
        id: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        source: doc.source,
        isActive: doc.isActive,
        content: doc.content,
        contentLength: doc.content.length,
        chunkCount: chunks.length,
        chunks,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },

    async create(data: { title: string; source: string; content: string }): Promise<string> {
      const [doc] = await db
        .insert(aiKnowledgeDocument)
        .values({
          id: crypto.randomUUID(),
          title: data.title,
          source: data.source,
          content: data.content,
          isActive: true,
        })
        .returning({ id: aiKnowledgeDocument.id });
      return doc!.id;
    },

    async update(id: string, partial: Partial<{ title: string; source: string; content: string; isActive: boolean }>): Promise<void> {
      await db
        .update(aiKnowledgeDocument)
        .set({ ...partial, updatedAt: new Date() })
        .where(eq(aiKnowledgeDocument.id, id));
    },

    async getContentById(id: string): Promise<{ content: string } | null> {
      const [doc] = await db
        .select({ content: aiKnowledgeDocument.content })
        .from(aiKnowledgeDocument)
        .where(eq(aiKnowledgeDocument.id, id));
      return doc ?? null;
    },

    async remove(id: string): Promise<void> {
      await db.delete(aiKnowledgeDocument).where(eq(aiKnowledgeDocument.id, id));
    },

    async replaceChunks(documentId: string, chunks: KnowledgeChunkInput[]): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(aiKnowledgeChunk).where(eq(aiKnowledgeChunk.documentId, documentId));
        if (chunks.length > 0) {
          await tx.insert(aiKnowledgeChunk).values(
            chunks.map((c) => ({
              id: crypto.randomUUID(),
              documentId,
              content: c.content,
              embedding: c.embedding,
              model: c.model,
            })),
          );
        }
      });
    },

    /**
     * Recuperación RAG. El aislamiento multi-tenant vive aquí:
     * plataforma (org IS NULL) + documentos de la org de la sesión.
     */
    async searchSimilar(params: {
      queryEmbedding: number[];
      organizationId: string | null;
      topK: number;
      minSimilarity: number;
    }): Promise<SimilarChunk[]> {
      const distance = cosineDistance(aiKnowledgeChunk.embedding, params.queryEmbedding);
      const rows = await db
        .select({
          id: aiKnowledgeChunk.id,
          documentId: aiKnowledgeChunk.documentId,
          content: aiKnowledgeChunk.content,
          similarity: sql<number>`1 - (${distance})`,
        })
        .from(aiKnowledgeChunk)
        .innerJoin(aiKnowledgeDocument, eq(aiKnowledgeChunk.documentId, aiKnowledgeDocument.id))
        .where(
          and(
            eq(aiKnowledgeDocument.isActive, true),
            params.organizationId
              ? or(isNull(aiKnowledgeDocument.organizationId), eq(aiKnowledgeDocument.organizationId, params.organizationId))
              : isNull(aiKnowledgeDocument.organizationId),
          ),
        )
        .orderBy(sql`1 - (${distance}) asc`)
        .limit(params.topK);
      return rows
        .map((r) => ({ ...r, similarity: Number(r.similarity) }))
        .filter((r) => r.similarity >= params.minSimilarity);
    },
  };
}

export type KnowledgeRepository = ReturnType<typeof createKnowledgeRepository>;
