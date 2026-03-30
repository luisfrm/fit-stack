import { z } from 'zod';

/**
 * Zod Schemas for CMS Block data Validation.
 * Each block type has a strictly defined structure for the JSONB 'data' field.
 */

export const HeroBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  imageKey: z.string().optional(),
});

export const ServicesBlockSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  items: z.array(z.object({
    icon: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
  })).default([]),
});

export const ClassesInfoBlockSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  buttonText: z.string().default('Ir a clases'),
});

export const TestimonialsBlockSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    author: z.string().min(1),
    role: z.string().optional(),
    content: z.string().min(1),
    avatarKey: z.string().optional(),
    rating: z.number().min(1).max(5).default(5),
  })).default([]),
});

export const GalleryBlockSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    imageKey: z.string().min(1),
    caption: z.string().optional(),
  })).default([]),
});

export const ContactBlockSchema = z.object({
  title: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional(),
  googleMapsUrl: z.string().url('URL no válida').optional(),
  social: z.object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    whatsapp: z.string().optional(),
  }).optional(),
});

export const TeamInfoBlockSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
});

/**
 * Union schema to validate any block's data based on its type.
 * Used by the service layer during create/update operations.
 */
export const BLOCK_SCHEMAS: Record<string, z.ZodObject<any>> = {
  hero: HeroBlockSchema,
  services: ServicesBlockSchema,
  classes_info: ClassesInfoBlockSchema,
  testimonials: TestimonialsBlockSchema,
  gallery: GalleryBlockSchema,
  contact: ContactBlockSchema,
  team_info: TeamInfoBlockSchema,
};

export function validateBlockData(type: string, data: any) {
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) {
    throw new Error(`Tipo de bloque desconocido: ${type}`);
  }
  return schema.parse(data);
}
