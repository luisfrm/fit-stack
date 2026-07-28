import { apiClient } from '../api-client'
import { ICmsPage, ICmsBlock, IPageWithBlocks, CmsBlockType } from '@/types/cms'

export const cmsContentService = {
  // --- PAGES ---
  
  getPages: async (): Promise<ICmsPage[]> => {
    const { data } = await apiClient.get<ICmsPage[]>('/cms/pages')
    return data
  },

  getPage: async (id: number): Promise<ICmsPage> => {
    const { data } = await apiClient.get<ICmsPage>(`/cms/pages/${id}`)
    return data
  },

  createPage: async (page: Omit<ICmsPage, 'id'>): Promise<ICmsPage> => {
    const { data } = await apiClient.post<ICmsPage>('/cms/pages', page)
    return data
  },

  updatePage: async (id: number, page: Partial<ICmsPage>): Promise<ICmsPage> => {
    const { data } = await apiClient.patch<ICmsPage>(`/cms/pages/${id}`, page)
    return data
  },

  deletePage: async (id: number): Promise<void> => {
    await apiClient.delete(`/cms/pages/${id}`)
  },

  // --- BLOCKS ---

  getBlocks: async (pageId: number): Promise<ICmsBlock[]> => {
    const { data } = await apiClient.get<ICmsBlock[]>(`/cms/pages/${pageId}/blocks`)
    return data
  },

  createBlock: async (pageId: number, block: { blockType: CmsBlockType, data: any, displayOrder: number }): Promise<ICmsBlock> => {
    const { data } = await apiClient.post<ICmsBlock>(`/cms/pages/${pageId}/blocks`, block)
    return data
  },

  updateBlock: async (id: number, block: Partial<ICmsBlock>): Promise<ICmsBlock> => {
    const { data } = await apiClient.patch<ICmsBlock>(`/cms/blocks/${id}`, block)
    return data
  },

  deleteBlock: async (id: number): Promise<void> => {
    await apiClient.delete(`/cms/blocks/${id}`)
  },

  reorderBlocks: async (pageId: number, orders: { id: number, displayOrder: number }[]): Promise<void> => {
    await apiClient.put(`/cms/pages/${pageId}/blocks`, { orders })
  },

  // --- PUBLIC ---

  getPublicPage: async (slug: string): Promise<IPageWithBlocks> => {
    const { data } = await apiClient.get<IPageWithBlocks>(`/public/pages/${slug}`)
    return data
  },

  // --- MEDIA ---

  getPresignedUrl: async (filename: string, contentType: string, folder: string = 'cms'): Promise<{ presignedUrl: string, key: string }> => {
    const { data } = await apiClient.post('/upload/presigned', {
      filename, contentType, folder
    })
    return data
  }
}
