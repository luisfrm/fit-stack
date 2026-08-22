import {
  RAG_CONFIG,
  WORKERS_AI_EMBEDDING_MODEL,
  splitIntoChunks,
} from '@workspace/shared';
import type { KnowledgeRepository } from '../repositories/knowledge.repository';
import type { AIService } from './ai.service';

export function createKnowledgeService(repo: KnowledgeRepository, aiService: AIService) {
  async function embedChunks(contents: string[]): Promise<{ content: string; embedding: number[]; model: string }[]> {
    if (contents.length === 0) return [];
    const embeddings = await aiService.embed(contents);
    return contents.map((content, i) => ({
      content,
      embedding: embeddings[i]!,
      model: WORKERS_AI_EMBEDDING_MODEL,
    }));
  }

  return {
    async list(organizationId?: string | null) {
      const docs = await repo.list(organizationId ?? null);
      return { data: docs };
    },

    async getById(id: string) {
      const doc = await repo.getById(id);
      if (!doc) throw new Error('Documento no encontrado');
      return { data: doc };
    },

    async create(input: { title: string; source: string; content: string }) {
      const documentId = await repo.create({
        title: input.title,
        source: input.source,
        content: input.content,
      });
      try {
        const chunks = await embedChunks(splitIntoChunks(input.content));
        await repo.replaceChunks(documentId, chunks);
      } catch (err) {
        await repo.remove(documentId).catch(() => {});
        throw err;
      }
      return this.getById(documentId);
    },

    async update(
      id: string,
      partial: Partial<{ title: string; source: string; content: string; isActive: boolean }>,
    ) {
      const current = await repo.getContentById(id);
      if (!current) throw new Error('Documento no encontrado');
      await repo.update(id, partial);
      if (partial.content !== undefined && partial.content !== current.content) {
        const chunks = await embedChunks(splitIntoChunks(partial.content));
        await repo.replaceChunks(id, chunks);
      }
      return this.getById(id);
    },

    async remove(id: string) {
      await repo.remove(id);
      return { success: true as const };
    },

    /** Recuperación para el chat. Nunca lanza: fallo de RAG no debe romper el chat. */
    async searchForChat(query: string, organizationId: string | null): Promise<string> {
      try {
        const trimmed = query.trim().slice(0, RAG_CONFIG.chunkSizeChars * 2);
        if (!trimmed) return '';
        const [queryEmbedding] = await aiService.embed([trimmed]);
        if (!queryEmbedding) return '';
        const hits = await repo.searchSimilar({
          queryEmbedding,
          organizationId,
          topK: RAG_CONFIG.topK,
          minSimilarity: RAG_CONFIG.minSimilarity,
        });
        if (hits.length === 0) return '';
        let context = '';
        for (const hit of hits) {
          const piece = (context ? '\n\n' : '') + hit.content;
          if (context.length + piece.length > RAG_CONFIG.maxContextChars) break;
          context += piece;
        }
        return context;
      } catch (err) {
        console.error('[rag] retrieval falló, continúo sin contexto:', err instanceof Error ? err.message : err);
        return '';
      }
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
