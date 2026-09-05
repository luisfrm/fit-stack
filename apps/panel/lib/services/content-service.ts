import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  IContentPage,
  IContentBlock,
  IContentBlockData,
  ContentBlockType,
} from "@/types/content";

const CMS_PATH = "/cms";

export const contentService = {
  // --- PAGES ---

  async getPages(options?: ApiFetchOptions): Promise<IContentPage[]> {
    return await api<IContentPage[]>(`${CMS_PATH}/pages`, options);
  },

  async getPage(
    id: number,
    options?: ApiFetchOptions,
  ): Promise<IContentPage> {
    return await api<IContentPage>(`${CMS_PATH}/pages/${id}`, options);
  },

  async createPage(page: Omit<IContentPage, "id">): Promise<IContentPage> {
    return await api<IContentPage>(`${CMS_PATH}/pages`, {
      method: "POST",
      body: page,
    });
  },

  async updatePage(
    id: number,
    page: Partial<IContentPage>,
  ): Promise<IContentPage> {
    return await api<IContentPage>(`${CMS_PATH}/pages/${id}`, {
      method: "PUT",
      body: page,
    });
  },

  async deletePage(id: number): Promise<void> {
    await api(`${CMS_PATH}/pages/${id}`, { method: "DELETE" });
  },

  // --- BLOCKS ---

  async getBlocks(
    pageId: number,
    options?: ApiFetchOptions,
  ): Promise<IContentBlock[]> {
    return await api<IContentBlock[]>(
      `${CMS_PATH}/pages/${pageId}/blocks`,
      options,
    );
  },

  async createBlock(
    pageId: number,
    block: { blockType: ContentBlockType; data: unknown; displayOrder?: number },
  ): Promise<IContentBlock> {
    // The API creates blocks at POST /cms/blocks with pageId in the body;
    // displayOrder is optional — the server computes max(existing) + 1.
    return await api<IContentBlock>(`${CMS_PATH}/blocks`, {
      method: "POST",
      body: { pageId, ...block },
    });
  },

  async updateBlock(
    id: number,
    block: { data?: IContentBlockData; isVisible?: boolean },
  ): Promise<IContentBlock> {
    return await api<IContentBlock>(`${CMS_PATH}/blocks/${id}`, {
      method: "PUT",
      body: block,
    });
  },

  async deleteBlock(id: number): Promise<void> {
    await api(`${CMS_PATH}/blocks/${id}`, { method: "DELETE" });
  },

  async reorderBlocks(
    pageId: number,
    orders: { id: number; displayOrder: number }[],
  ): Promise<void> {
    await api(`${CMS_PATH}/pages/${pageId}/blocks/reorder`, {
      method: "PUT",
      body: { orders },
    });
  },

  // --- MEDIA ---

  async getPresignedUrl(
    filename: string,
    contentType: string,
    folder: string = "cms",
  ): Promise<{ presignedUrl: string; key: string }> {
    return await api<{ presignedUrl: string; key: string }>(
      "/upload/presigned",
      {
        method: "POST",
        body: { filename, contentType, folder },
      },
    );
  },
};
