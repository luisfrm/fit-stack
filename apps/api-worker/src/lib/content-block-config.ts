// Single source of truth: packages/shared/src/content.ts
export {
  HeroBlockSchema,
  ServicesBlockSchema,
  ClassesBlockSchema,
  TestimonialsBlockSchema,
  GalleryBlockSchema,
  ContactBlockSchema,
  TeamBlockSchema,
  BLOCK_SCHEMAS,
  validateBlockData,
} from '@workspace/shared';
export type { ContentBlockType, IContentBlockData, BlockDataMap } from '@workspace/shared';