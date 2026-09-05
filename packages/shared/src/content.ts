import { z } from 'zod';

/* ── CMS / Content module — single source of truth ─────────────────────
   Types and Zod schemas shared by the api-worker (validation) and the
   panel (forms). Never duplicate these in apps.
   ─────────────────────────────────────────────────────────────────────── */

// ── Block data schemas ──

export const HeroBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  imageKey: z.string().optional(),
});

export const ServicesBlockItemSchema = z.object({
  icon: z.string().optional(),
  title: z.string().min(1, 'El título del servicio es requerido'),
  description: z.string().optional(),
});

export const ServicesBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  items: z.array(ServicesBlockItemSchema).default([]),
});

export const ClassesBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  buttonText: z.string().default('Ir a clases'),
});

export const TestimonialItemSchema = z.object({
  author: z.string().min(1, 'El autor es requerido'),
  role: z.string().optional(),
  content: z.string().min(1, 'La reseña es requerida'),
  avatarKey: z.string().optional(),
  rating: z.number().min(1).max(5).default(5),
});

export const TestimonialsBlockSchema = z.object({
  title: z.string().optional(),
  items: z.array(TestimonialItemSchema).default([]),
});

export const GalleryItemSchema = z.object({
  imageKey: z.string().min(1, 'La imagen es requerida'),
  caption: z.string().optional(),
});

export const GalleryBlockSchema = z.object({
  title: z.string().optional(),
  items: z.array(GalleryItemSchema).default([]),
});

export const ContactBlockSchema = z.object({
  title: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional(),
  googleMapsUrl: z.string().url('URL no válida').optional(),
  social: z
    .object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      whatsapp: z.string().optional(),
    })
    .optional(),
});

export const TeamBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
});

/** Every supported block type mapped to its data schema. */
export const BLOCK_SCHEMAS = {
  hero: HeroBlockSchema,
  services: ServicesBlockSchema,
  classes: ClassesBlockSchema,
  testimonials: TestimonialsBlockSchema,
  gallery: GalleryBlockSchema,
  contact: ContactBlockSchema,
  team: TeamBlockSchema,
} as const;

export type ContentBlockType = keyof typeof BLOCK_SCHEMAS;

/** Inferred data shape for each block type. */
export type BlockDataMap = {
  [K in ContentBlockType]: z.infer<(typeof BLOCK_SCHEMAS)[K]>;
};

/** Union of every block data payload. */
export type IContentBlockData = BlockDataMap[ContentBlockType];

export function validateBlockData(type: string, data: unknown): unknown {
  const schema = BLOCK_SCHEMAS[type as ContentBlockType];
  if (!schema) {
    throw new Error(`Tipo de bloque desconocido: ${type}`);
  }
  return schema.parse(data);
}

// ── Page / Block entities ──

export interface IContentPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface IContentBlockBase {
  id: number;
  pageId: number;
  isVisible: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A content block, discriminated on `blockType` so `data` is typed per block
 * (e.g. `hero` blocks carry `{ title, subtitle, ... }`).
 */
export type IContentBlock = {
  [K in ContentBlockType]: IContentBlockBase & {
    blockType: K;
    data: BlockDataMap[K];
  };
}[ContentBlockType];

export interface IContentPageWithBlocks extends IContentPage {
  blocks: IContentBlock[];
}