// Single source of truth: packages/shared/src/content.ts
export {
  HeroBlockSchema,
  ServicesBlockSchema,
  ServicesBlockItemSchema,
  ClassesBlockSchema,
  TestimonialsBlockSchema,
  TestimonialItemSchema,
  GalleryBlockSchema,
  GalleryItemSchema,
  ContactBlockSchema,
  TeamBlockSchema,
  BLOCK_SCHEMAS,
  validateBlockData,
} from "@workspace/shared";
export type {
  ContentBlockType,
  IContentBlockData,
  BlockDataMap,
  IContentPage,
  IContentBlock,
  IContentPageWithBlocks,
} from "@workspace/shared";