import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  IContentPage,
  IContentBlock,
  IContentPageWithBlocks,
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
      method: "PATCH",
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
    block: { blockType: ContentBlockType; data: unknown; displayOrder: number },
  ): Promise<IContentBlock> {
    return await api<IContentBlock>(`${CMS_PATH}/pages/${pageId}/blocks`, {
      method: "POST",
      body: block,
    });
  },

  async updateBlock(
    id: number,
    block: Partial<IContentBlock>,
  ): Promise<IContentBlock> {
    return await api<IContentBlock>(`${CMS_PATH}/blocks/${id}`, {
      method: "PATCH",
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
    await api(`${CMS_PATH}/pages/${pageId}/blocks`, {
      method: "PUT",
      body: { orders },
    });
  },

  // --- PUBLIC ---

  async getPublicPage(
    slug: string,
    options?: ApiFetchOptions,
  ): Promise<IContentPageWithBlocks> {
    return await api<IContentPageWithBlocks>(`/public/pages/${slug}`, options);
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
