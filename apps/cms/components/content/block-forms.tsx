"use client";

import * as React from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Text } from "@workspace/ui/components/text";
import { toast } from "@workspace/ui/components";
import { ImageUploader } from "./image-uploader";
import { ICmsBlock } from "@/types/cms";
import { cmsContentService } from "@/lib/services/cms-content-service";

import { z } from "zod";

const HeroSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  subtitle: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  imageKey: z.string().optional(),
});

const DescriptionSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  subtitle: z.string().optional(),
});

const TestimonialsSchema = z.object({
  items: z.array(z.object({
    author: z.string().min(1, "Autor requerido"),
    role: z.string().optional(),
    content: z.string().min(1, "Contenido requerido"),
    avatarKey: z.string().optional(),
    rating: z.number().min(1).max(5).default(5),
  })),
});

const GallerySchema = z.object({
  items: z.array(z.object({
    imageKey: z.string().min(1, "Imagen requerida"),
    caption: z.string().optional(),
  })),
});

const ContactSchema = z.object({
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  social: z.object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    whatsapp: z.string().optional(),
  }),
});

/* ─────────────────────────────────────────────
   BLOCK RENDERER / FACTORY
   ───────────────────────────────────────────── */

interface BlockFormProps {
  block: ICmsBlock;
  onSuccess: () => void;
}

export function BlockDataForm({ block, onSuccess }: Readonly<BlockFormProps>) {
  const [isSaving, setIsSaving] = React.useState(false);

  const handleUpdate = async (data: any) => {
    try {
      setIsSaving(true);
      await cmsContentService.updateBlock(block.id, { data });
      toast.success("Contenido actualizado");
      onSuccess();
    } catch (error: any) {
      console.error(error);
      toast.error("Error al guardar cambios");
    } finally {
      setIsSaving(false);
    }
  };

  switch (block.blockType) {
    case "hero":
      return <HeroForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "testimonials":
      return <TestimonialsForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "gallery":
      return <GalleryForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "contact":
      return <ContactForm data={block.data} onSave={handleUpdate} isLoading={isSaving} />;
    case "classes_info":
    case "team_info":
    case "services":
      return <GeneralInfoForm data={block.data} onSave={handleUpdate} isLoading={isSaving} titleLabel={block.blockType} />;
    default:
      return <Text variant="muted">Editor no implementado aún para {block.blockType}</Text>;
  }
}

/* ─────────────────────────────────────────────
   INDIVIDUAL FORMS
   ───────────────────────────────────────────── */

function HeroForm({ data, onSave, isLoading }: any) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(HeroSchema),
    defaultValues: data || { title: "", subtitle: "", ctaText: "", ctaLink: "", imageKey: "" }
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Input label="Título Principal" {...register("title")} />
          {errors.title && <Text size="xs" className="text-rose-400 mt-1">{errors.title.message as string}</Text>}
          <Input label="Subtítulo / Bajada" {...register("subtitle")} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Texto de Botón" {...register("ctaText")} />
            <Input label="Link de Botón" {...register("ctaLink")} />
          </div>
        </div>
        <div className="space-y-2">
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

function TestimonialsForm({ data, onSave, isLoading }: any) {
  const { control, handleSubmit, register } = useForm({
    resolver: zodResolver(TestimonialsSchema),
    defaultValues: data?.items?.length ? data : { items: [] }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={field.id} className="p-4 bg-white/5 rounded-xl border border-white/5 relative group">
            <Button 
              type="button" 
              variant="ghost-danger"
              size="xs"
              rounded="full"
              onClick={() => remove(index)}
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 shadow-none border-none"
            >
              <Trash2 size={16} />
            </Button>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                   <Controller 
                      name={`items.${index}.avatarKey`} 
                      control={control} 
                      render={({ field }) => <ImageUploader value={field.value} onChange={field.onChange} />}
                   />
                </div>
                <div className="md:col-span-2 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <Input label="Autor" {...register(`items.${index}.author`)} />
                      <Input label="Rol (ej. Miembro)" {...register(`items.${index}.role`)} />
                   </div>
                   <Input label="Reseña" {...register(`items.${index}.content`)} />
                </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center pt-4 border-t border-white/5">
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          leftIcon={<Plus size={16} />} 
          onClick={() => append({ author: "", content: "", rating: 5 })}
        >
          Añadir Testimonio
        </Button>
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Testimonios</Button>
      </div>
    </form>
  );
}

function GalleryForm({ data, onSave, isLoading }: any) {
    const { control, handleSubmit, register } = useForm({
      resolver: zodResolver(GallerySchema),
      defaultValues: data?.items?.length ? data : { items: [] }
    });
  
    const { fields, append, remove } = useFieldArray({
      control,
      name: "items"
    });
  
    return (
      <form onSubmit={handleSubmit(onSave)} className="space-y-6">
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
                  render={({ field }) => <ImageUploader value={field.value} onChange={field.onChange} />}
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

function ContactForm({ data, onSave, isLoading }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: data || { address: "", phone: "", email: "", googleMapsUrl: "", social: {} }
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Input label="Dirección Física" {...register("address")} />
          <div className="grid grid-cols-2 gap-4">
             <Input label="Teléfono" {...register("phone")} />
             <Input label="Email de Contacto" {...register("email")} />
          </div>
          <Input label="Google Maps URL (Embed/Link)" {...register("googleMapsUrl")} />
        </div>
        <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
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

function GeneralInfoForm({ data, onSave, isLoading, titleLabel }: any) {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(DescriptionSchema),
    defaultValues: data || { title: "", subtitle: "" }
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 max-w-xl">
        <Input label={`Título de ${titleLabel}`} {...register("title")} />
        <Input label="Subtítulo / Descripción corta" {...register("subtitle")} />
      </div>
      <div className="flex justify-end pt-4 border-t border-white/5">
        <Button type="submit" variant="primary" loading={isLoading}>Guardar Sección</Button>
      </div>
    </form>
  );
}
