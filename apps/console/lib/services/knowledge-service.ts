import { api, type ApiFetchOptions } from "@/lib/api/client";

export type KnowledgeSource = "faq" | "policy" | "settings";

export interface KnowledgeDoc {
  id: string;
  organizationId: string | null;
  title: string;
  source: KnowledgeSource;
  isActive: boolean;
  contentLength: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
}

export interface KnowledgeDocDetail extends KnowledgeDoc {
  content: string;
  chunks: KnowledgeChunk[];
}

const KNOWLEDGE_PATH = "/platform/knowledge";

export const KNOWLEDGE_SOURCE_LABELS: Record<KnowledgeSource, string> = {
  faq: "FAQ",
  policy: "Política",
  settings: "Configuración",
};

export const knowledgeService = {
  async getAll(options?: ApiFetchOptions): Promise<{ data: KnowledgeDoc[] }> {
    return await api<{ data: KnowledgeDoc[] }>(KNOWLEDGE_PATH, options);
  },

  async getById(id: string, options?: ApiFetchOptions): Promise<{ data: KnowledgeDocDetail }> {
    return await api<{ data: KnowledgeDocDetail }>(`${KNOWLEDGE_PATH}/${id}`, options);
  },

  async create(input: { title: string; source: KnowledgeSource; content: string }): Promise<{ data: KnowledgeDoc }> {
    return await api<{ data: KnowledgeDoc }>(KNOWLEDGE_PATH, { method: "POST", body: input });
  },

  async update(
    id: string,
    input: Partial<{ title: string; source: KnowledgeSource; content: string; isActive: boolean }>,
  ): Promise<{ data: KnowledgeDoc }> {
    return await api<{ data: KnowledgeDoc }>(`${KNOWLEDGE_PATH}/${id}`, {
      method: "PATCH",
      body: input,
    });
  },

  async remove(id: string): Promise<{ success: boolean }> {
    return await api<{ success: boolean }>(`${KNOWLEDGE_PATH}/${id}`, { method: "DELETE" });
  },
};
