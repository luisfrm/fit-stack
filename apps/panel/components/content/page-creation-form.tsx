"use client";

import * as React from "react";
import { Input, Button, toast } from "@workspace/ui/components";

export interface PageCreationFormValues {
  title: string;
  slug: string;
  description: string;
}

interface PageCreationFormProps {
  readonly onSubmit: (values: PageCreationFormValues) => Promise<void>;
  readonly onCancel: () => void;
}

const ROOT_SLUG = "/";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-+|-+)+/g, "");
}

export function generatePageSlug(title: string): string {
  return `/${slugify(title)}`;
}

export function PageCreationForm({ onSubmit, onCancel }: PageCreationFormProps) {
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const slugTouchedRef = React.useRef(false);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (!slugTouchedRef.current || slug === "" || slug === generatePageSlug(title)) {
      setSlug(generatePageSlug(newTitle));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    slugTouchedRef.current = true;
    let newSlug = e.target.value.toLowerCase();

    if (newSlug === "") {
      setSlug(ROOT_SLUG);
      return;
    }

    if (!newSlug.startsWith("/")) {
      newSlug = "/" + newSlug;
    }
    newSlug = newSlug.replaceAll(/\s+/g, "-").replaceAll(/\/+/g, "/");
    setSlug(newSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      toast.error("El título y el slug son obligatorios");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <Input
        label="Título de la Página"
        placeholder="ej. Nosotros"
        value={title}
        onChange={handleTitleChange}
        required
      />
      <Input
        label="Slug (URL)"
        placeholder="/ (para la página de inicio)"
        value={slug}
        onChange={handleSlugChange}
        required
      />
      <Input
        label="Descripción (Opcional)"
        placeholder="Breve resumen de la página..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Crear Página
        </Button>
      </div>
    </form>
  );
}
