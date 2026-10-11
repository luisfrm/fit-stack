import { eq, and, sql, isNull, or, desc, cosineDistance, inArray } from 'drizzle-orm';
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
      if (rows.length === 0) return [];
      // Count scoped to listed docs (avoids full table scan)
      const docIds = rows.map((r) => r.id);
      const counts = await db
        .select({
          documentId: aiKnowledgeChunk.documentId,
          count: sql<number>`count(*)::int`,
        })
        .from(aiKnowledgeChunk)
        .where(inArray(aiKnowledgeChunk.documentId, docIds))
        .groupBy(aiKnowledgeChunk.documentId);
      const countMap = new Map(counts.map((c) => [c.documentId, Number(c.count)]));
      return rows.map((r) => ({
        ...r,
        contentLength: Number(r.contentLength),
        chunkCount: countMap.get(r.id) ?? 0,
      }));
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

    /**
     * Replaces document chunks. No transaction: neon-http (Neon HTTP driver
     * for Workers) does not support interactive transactions. The delete→insert
     * order is acceptable: service.create deletes the entire document if
     * re-embedding fails; in update the worst case is a doc without chunks until
     * the next save with content.
     */
    async replaceChunks(documentId: string, chunks: KnowledgeChunkInput[]): Promise<void> {
      await db.delete(aiKnowledgeChunk).where(eq(aiKnowledgeChunk.documentId, documentId));
      if (chunks.length > 0) {
        await db.insert(aiKnowledgeChunk).values(
          chunks.map((c) => ({
            id: crypto.randomUUID(),
            documentId,
            content: c.content,
            embedding: c.embedding,
            model: c.model,
          })),
        );
      }
    },

    /**
     * RAG retrieval. Multi-tenant isolation lives here:
     * platform (org IS NULL) + session org documents.
     */
    async searchSimilar(params: {
      queryEmbedding: number[];
      organizationId: string | null;
      topK: number;
      minSimilarity: number;
    }): Promise<SimilarChunk[]> {
      const distance = cosineDistance(aiKnowledgeChunk.embedding, params.queryEmbedding);
      const similarity = sql<number>`1 - (${distance})`;
      const rows = await db
        .select({
          id: aiKnowledgeChunk.id,
          documentId: aiKnowledgeChunk.documentId,
          content: aiKnowledgeChunk.content,
          similarity,
        })
        .from(aiKnowledgeChunk)
        .innerJoin(aiKnowledgeDocument, eq(aiKnowledgeChunk.documentId, aiKnowledgeDocument.id))
        .where(
          and(
            eq(aiKnowledgeDocument.isActive, true),
            params.organizationId
              ? or(isNull(aiKnowledgeDocument.organizationId), eq(aiKnowledgeDocument.organizationId, params.organizationId))
              : isNull(aiKnowledgeDocument.organizationId),
            sql`${similarity} >= ${params.minSimilarity}`,
          ),
        )
        .orderBy(sql`${similarity} desc`)
        .limit(params.topK);
      return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
    },
  };
}

export type KnowledgeRepository = ReturnType<typeof createKnowledgeRepository>;
