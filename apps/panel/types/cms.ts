export type CmsBlockType = 
  | 'hero' 
  | 'services' 
  | 'classes_info' 
  | 'testimonials' 
  | 'gallery' 
  | 'contact' 
  | 'team_info';

export interface ICmsPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICmsBlock {
  id: number;
  pageId: number;
  blockType: CmsBlockType;
  data: any; // Tipado dinámico según blockType
  isVisible: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IPageWithBlocks extends ICmsPage {
  blocks: ICmsBlock[];
}
