"use client";

import * as React from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Star } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Text } from "@workspace/ui/components/text";
import { toast } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import { ImageUploader } from "./image-uploader";
import { IContentBlock, IContentBlockData } from "@/types/content";
import { contentService } from "@/lib/services/content-service";

import {
  HeroBlockSchema,
  ServicesBlockSchema,
  ServicesBlockItemSchema,
  ClassesBlockSchema,
  TestimonialsBlockSchema,
  TestimonialItemSchema,
  GalleryBlockSchema,
  ContactBlockSchema,
  TeamBlockSchema,
} from "@/types/content";

import type { z } from "zod";

type HeroData = z.infer<typeof HeroBlockSchema>;
type ServicesData = z.infer<typeof ServicesBlockSchema>;
type ClassesData = z.infer<typeof ClassesBlockSchema>;
type TestimonialsData = z.infer<typeof TestimonialsBlockSchema>;
type GalleryData = z.infer<typeof GalleryBlockSchema>;
type ContactData = z.infer<typeof ContactBlockSchema>;
type TeamData = z.infer<typeof TeamBlockSchema>;

/* ─────────────────────────────────────────────
   BLOCK RENDERER / FACTORY
   ───────────────────────────────────────────── */

interface BlockFormProps {
  block: IContentBlock;
  onSuccess: () => void;
}

export function BlockDataForm({ block, onSuccess }: Readonly<BlockFormProps>) {
  const [isSaving, setIsSaving] = React.useState(false);

  const handleUpdate = async (data: IContentBlockData) => {
    try {
      setIsSaving(true);
      await contentService.updateBlock(block.id, { data });
      toast.success("Contenido actualizado");
      onSuccess();
    } catch (error: unknown) {
      console.error(error);
      toast.error("Error al guardar cambios");
    } finally {
      setIsSaving(false);
    }
  };

  switch (block.blockType) {
    case "hero":
      return <HeroForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "services":
      return <ServicesForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "classes":
      return <ClassesForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "testimonials":
      return <TestimonialsForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "gallery":
      return <GalleryForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "contact":
      return <ContactForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "team":
      return <TeamForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    default:
      return <Text variant="muted">Editor no implementado aún</Text>;
  }
}

/* ─────────────────────────────────────────────
   SHARED FORM PRIMITIVES
   ───────────────────────────────────────────── */

function ItemCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 relative group">
      {children}
    </div>
  );
}

function RemoveItemButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost-danger"
      size="xs"
      rounded="full"
      onClick={onClick}
      className={cn(
        "absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 shadow-none border-none",
        className,
      )}
    >
      <Trash2 size={16} />
    </Button>
  );
}

/** Star rating input (1-5), stored as number — used by testimonials. */
function RatingInput({
  value,
  onChange,
}: {
  value?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
          aria-label={`${star} estrellas`}
        >
          <Star
            size={16}
            className={cn(
              "transition-colors",
              (value ?? 0) >= star
                ? "fill-amber-400 text-amber-400"
                : "text-slate-600 hover:text-slate-500",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   INDIVIDUAL FORMS
   ───────────────────────────────────────────── */

function HeroForm({
  data,
  onSave,
  isLoading,
}: {
  data: HeroData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<
    z.input<typeof HeroBlockSchema>,
    unknown,
    HeroData
  >({
    resolver: zodResolver(HeroBlockSchema),
    defaultValues: data || { title: "", subtitle: "", ctaText: "", ctaLink: "", imageKey: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <Input label="Título Principal" {...register("title")} />
          {errors.title && <Text size="xs" className="text-rose-400 mt-1">{errors.title.message as string}</Text>}
          <Input label="Subtítulo / Bajada" {...register("subtitle")} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Texto de Botón" {...register("ctaText")} />
            <Input label="Link de Botón" {...register("ctaLink")} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Controller
            name="imageKey"
            control={control}
            render={({ field }) => <ImageUploader label="Imagen de Fondo" value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Hero</Button>
      </div>
    </form>
  );
}

function ServicesForm({
  data,
  onSave,
  isLoading,
}: {
  data: ServicesData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<
    z.input<typeof ServicesBlockSchema>,
    unknown,
    ServicesData
  >({
    resolver: zodResolver(ServicesBlockSchema),
    defaultValues: data || { title: "", subtitle: "", items: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 max-w-xl">
        <Input label="Título de Servicios" {...register("title")} />
        {errors.title && <Text size="xs" className="text-rose-400 mt-1">{errors.title.message as string}</Text>}
        <Input label="Subtítulo / Descripción corta" {...register("subtitle")} />
      </div>

      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <ItemCard key={field.id}>
            <RemoveItemButton onClick={() => remove(index)} />
            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4 pr-8">
              <Input placeholder="Icono (emoji)" {...register(`items.${index}.icon`)} />
              <div className="flex flex-col gap-3">
                <Input placeholder="Nombre del servicio" {...register(`items.${index}.title`)} />
                <Input placeholder="Descripción corta" {...register(`items.${index}.description`)} />
              </div>
            </div>
          </ItemCard>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-white/5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<Plus size={16} />}
          onClick={() => append({ icon: "", title: "", description: "" } satisfies z.infer<typeof ServicesBlockItemSchema>)}
        >
          Añadir Servicio
        </Button>
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Servicios</Button>
      </div>
    </form>
  );
}

function ClassesForm({
  data,
  onSave,
  isLoading,
}: {
  data: ClassesData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof ClassesBlockSchema>,
    unknown,
    ClassesData
  >({
    resolver: zodResolver(ClassesBlockSchema),
    defaultValues: data || { title: "", subtitle: "", buttonText: "Ir a clases" },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 max-w-xl">
        <Input label="Título de Clases" {...register("title")} />
        {errors.title && <Text size="xs" className="text-rose-400 mt-1">{errors.title.message as string}</Text>}
        <Input label="Subtítulo / Descripción corta" {...register("subtitle")} />
        <Input label="Texto del botón" {...register("buttonText")} />
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Clases</Button>
      </div>
    </form>
  );
}

function TestimonialsForm({
  data,
  onSave,
  isLoading,
}: {
  data: TestimonialsData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { control, handleSubmit, register } = useForm<
    z.input<typeof TestimonialsBlockSchema>,
    unknown,
    TestimonialsData
  >({
    resolver: zodResolver(TestimonialsBlockSchema),
    defaultValues: data?.items?.length ? data : { title: "", items: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="max-w-xl">
        <Input label="Título de la sección (opcional)" {...register("title")} />
      </div>
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <ItemCard key={field.id}>
            <RemoveItemButton onClick={() => remove(index)} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-8">
              <div className="md:col-span-1">
                <Controller
                  name={`items.${index}.avatarKey`}
                  control={control}
                  render={({ field: avatarField }) => <ImageUploader value={avatarField.value} onChange={avatarField.onChange} />}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Autor" {...register(`items.${index}.author`)} />
                  <Input label="Rol (ej. Miembro)" {...register(`items.${index}.role`)} />
                </div>
                <Input label="Reseña" {...register(`items.${index}.content`)} />
                <div className="flex items-center gap-3">
                  <Text size="sm" weight="medium" className="text-slate-300">Valoración</Text>
                  <Controller
                    name={`items.${index}.rating`}
                    control={control}
                    render={({ field: ratingField }) => (
                      <RatingInput value={ratingField.value} onChange={ratingField.onChange} />
                    )}
                  />
                </div>
              </div>
            </div>
          </ItemCard>
        ))}
      </div>
      <div className="flex justify-between items-center pt-4 border-t border-white/5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<Plus size={16} />}
          onClick={() => append({ author: "", role: "", content: "", avatarKey: "", rating: 5 } satisfies z.infer<typeof TestimonialItemSchema>)}
        >
          Añadir Testimonio
        </Button>
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Testimonios</Button>
      </div>
    </form>
  );
}

function GalleryForm({
  data,
  onSave,
  isLoading,
}: {
  data: GalleryData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { control, handleSubmit, register } = useForm<
    z.input<typeof GalleryBlockSchema>,
    unknown,
    GalleryData
  >({
    resolver: zodResolver(GalleryBlockSchema),
    defaultValues: data?.items?.length ? data : { title: "", items: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="max-w-xl">
        <Input label="Título de la sección (opcional)" {...register("title")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map((field, index) => (
          <div key={field.id} className="relative group p-3 bg-white/5 rounded-xl border border-white/5">
            <Button
              type="button"
              variant="danger"
              size="xs"
              rounded="full"
              onClick={() => remove(index)}
              className="absolute top-4 right-4 z-10 p-0 h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity border-none"
            >
              <Trash2 size={14} />
            </Button>
            <Controller
              name={`items.${index}.imageKey`}
              control={control}
              render={({ field: imageField }) => <ImageUploader value={imageField.value} onChange={imageField.onChange} />}
            />
            <div className="mt-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Input
                placeholder="Leyenda opcional"
                {...register(`items.${index}.caption`)}
                className="text-center h-8 text-xs"
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => append({ imageKey: "", caption: "" })}
          className="flex flex-col items-center justify-center gap-3 h-full min-h-[160px] rounded-xl border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all text-slate-500 hover:text-primary p-6"
        >
          <Plus size={24} />
          <Text size="xs" weight="medium">Añadir Imagen</Text>
        </Button>
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Galería</Button>
      </div>
    </form>
  );
}

function ContactForm({
  data,
  onSave,
  isLoading,
}: {
  data: ContactData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof ContactBlockSchema>,
    unknown,
    ContactData
  >({
    resolver: zodResolver(ContactBlockSchema),
    defaultValues: data || { address: "", phone: "", email: "", googleMapsUrl: "", social: {} },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <Input label="Título (opcional)" {...register("title")} />
          <Input label="Dirección Física" {...register("address")} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Teléfono" {...register("phone")} />
            <Input label="Email de Contacto" {...register("email")} />
          </div>
          {errors.email && <Text size="xs" className="text-rose-400 mt-1">{errors.email.message as string}</Text>}
          <Input label="Google Maps URL (Embed/Link)" {...register("googleMapsUrl")} />
          {errors.googleMapsUrl && <Text size="xs" className="text-rose-400 mt-1">{errors.googleMapsUrl.message as string}</Text>}
        </div>
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
          <Text weight="semibold" size="sm">Redes Sociales</Text>
          <Input label="Instagram" placeholder="@gym_premium" {...register("social.instagram")} />
          <Input label="Facebook" placeholder="Link a página" {...register("social.facebook")} />
          <Input label="WhatsApp" placeholder="+58..." {...register("social.whatsapp")} />
        </div>
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Info de Contacto</Button>
      </div>
    </form>
  );
}

function TeamForm({
  data,
  onSave,
  isLoading,
}: {
  data: TeamData;
  onSave: (data: IContentBlockData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<
    z.input<typeof TeamBlockSchema>,
    unknown,
    TeamData
  >({
    resolver: zodResolver(TeamBlockSchema),
    defaultValues: data || { title: "", subtitle: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 max-w-xl">
        <Input label="Título del Equipo" {...register("title")} />
        {errors.title && <Text size="xs" className="text-rose-400 mt-1">{errors.title.message as string}</Text>}
        <Input label="Subtítulo / Descripción corta" {...register("subtitle")} />
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Sección</Button>
      </div>
    </form>
  );
}