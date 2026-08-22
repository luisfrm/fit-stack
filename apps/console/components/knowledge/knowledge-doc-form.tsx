"use client";

import * as React from "react";
import {
  Button,
  Input,
  SimpleSelect,
  Textarea,
  Text,
  toast,
} from "@workspace/ui/components";
import {
  type KnowledgeSource,
} from "@/lib/services/knowledge-service";

const SOURCE_OPTIONS: { label: string; value: KnowledgeSource }[] = [
  { label: "FAQ", value: "faq" },
  { label: "Política", value: "policy" },
  { label: "Configuración", value: "settings" },
];

export interface KnowledgeDocFormValues {
  title: string;
  source: KnowledgeSource;
  content: string;
}

interface KnowledgeDocFormProps {
  readonly initialContent?: string;
  readonly initialTitle?: string;
  readonly initialSource?: KnowledgeSource;
  readonly onSubmit: (values: KnowledgeDocFormValues) => Promise<void>;
  readonly onCancel: () => void;
  readonly submitLabel?: string;
}

export function KnowledgeDocForm({
  initialContent = "",
  initialTitle = "",
  initialSource = "faq",
  onSubmit,
  onCancel,
  submitLabel,
}: KnowledgeDocFormProps) {
  const [title, setTitle] = React.useState(initialTitle);
  const [source, setSource] = React.useState<KnowledgeSource>(initialSource);
  const [content, setContent] = React.useState(initialContent);
  const [isSaving, setIsSaving] = React.useState(false);

  const isEdit = Boolean(initialTitle);
  const computedSubmitLabel = submitLabel ?? (isEdit ? "Guardar cambios" : "Crear documento");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    if (!isEdit && !content.trim()) {
      toast.error("El contenido es obligatorio");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({ title, source, content });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-[min(70vh,640px)] flex-col gap-5 py-2"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="kb-title"
          className="text-xs font-bold uppercase tracking-widest text-foreground-muted"
        >
          Título
        </label>
        <Input
          id="kb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="¿Cómo funcionan los créditos IA?"
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
          Tipo
        </label>
        <SimpleSelect
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(value) => setSource(value as KnowledgeSource)}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label
          htmlFor="kb-content"
          className="text-xs font-bold uppercase tracking-widest text-foreground-muted"
        >
          Contenido
        </label>
        <Textarea
          id="kb-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isEdit ? "(vacío = sin cambios)" : "Escribe aquí la información que debe conocer el asistente..."}
          className="min-h-0 flex-1 h-full"
          maxLength={20000}
        />
        <Text variant="muted" size="xs" className="text-right">
          {content.length.toLocaleString()} / 20.000 caracteres
        </Text>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outlined" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Guardando..." : computedSubmitLabel}
        </Button>
      </div>
    </form>
  );
}
