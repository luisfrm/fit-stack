export type ContentBlockType =
  | 'hero'
  | 'services'
  | 'classes'
  | 'testimonials'
  | 'gallery'
  | 'contact'
  | 'team';

export interface IContentPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IContentBlock {
  id: number;
  pageId: number;
  blockType: ContentBlockType;
  data: any; // Tipado dinámico según blockType
  isVisible: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IContentPageWithBlocks extends IContentPage {
  blocks: IContentBlock[];
}
