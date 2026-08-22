"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Library, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  SimpleSelect,
  Switch,
  Textarea,
  Text,
  Title,
  ConfirmationModal,
  toast,
} from "@workspace/ui/components";
import type { KnowledgeDoc, KnowledgeSource } from "@/lib/services/knowledge-service";
import {
  KNOWLEDGE_SOURCE_LABELS,
  knowledgeService,
} from "@/lib/services/knowledge-service";

const SOURCE_OPTIONS: { label: string; value: KnowledgeSource }[] = [
  { label: "FAQ", value: "faq" },
  { label: "Política", value: "policy" },
  { label: "Configuración", value: "settings" },
];

const SOURCE_BADGE_VARIANT: Record<KnowledgeSource, "default" | "info" | "warning"> = {
  faq: "info",
  policy: "warning",
  settings: "default",
};

interface DocumentFormState {
  id?: string;
  title: string;
  source: KnowledgeSource;
  content: string;
}

const EMPTY_FORM: DocumentFormState = { title: "", source: "faq", content: "" };

interface KnowledgeSettingsProps {
  readonly initialDocs: KnowledgeDoc[];
  readonly onSaved?: () => void | Promise<void>;
}

export function KnowledgeSettings({ initialDocs, onSaved }: KnowledgeSettingsProps) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<KnowledgeDoc[]>(initialDocs);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<DocumentFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<KnowledgeDoc | null>(null);

  const refresh = async () => {
    await onSaved?.();
    router.refresh();
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setForm({ id: doc.id, title: doc.title, source: doc.source, content: "" });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    if (!form.id && !form.content.trim()) {
      toast.error("El contenido es obligatorio");
      return;
    }
    setIsSaving(true);
    try {
      if (form.id) {
        const payload: Partial<{ title: string; source: KnowledgeSource; content: string }> = {
          title: form.title,
          source: form.source,
        };
        if (form.content.trim()) payload.content = form.content;
        await knowledgeService.update(form.id, payload);
        toast.success("Documento actualizado correctamente");
      } else {
        await knowledgeService.create({
          title: form.title,
          source: form.source,
          content: form.content,
        });
        toast.success("Documento creado y procesado correctamente");
      }
      setFormOpen(false);
      await refresh();
    } catch (error) {
      console.error("Error saving knowledge document:", error);
      toast.error("Error al guardar el documento");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (doc: KnowledgeDoc, isActive: boolean) => {
    try {
      await knowledgeService.update(doc.id, { isActive });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isActive } : d)));
      toast.success(isActive ? "Documento activado" : "Documento desactivado");
      await refresh();
    } catch (error) {
      console.error("Error toggling document:", error);
      toast.error("Error al cambiar el estado del documento");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await knowledgeService.remove(deleteTarget.id);
      toast.success("Documento eliminado");
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar el documento");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">
            Base de Conocimiento
          </Title>
          <Text variant="muted">
            Documentos que alimentan al asistente IA del panel vía búsqueda semántica. Los FAQs y
            políticas de FitStack están disponibles para todas las organizaciones.
          </Text>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className="size-4" />}>
          Nuevo documento
        </Button>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">{docs.length} documentos activos en la plataforma</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">
                Se fragmentan automáticamente para búsqueda semántica
              </Text>
            </div>
          </div>
        </Card>

        <Card variant="settings" className="p-0 overflow-hidden">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <div className="flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <BookOpen className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <Text className="font-bold">Sin documentos todavía</Text>
                <Text variant="muted" size="sm">
                  Crea tu primer FAQ o política para que el asistente pueda responder sobre FitStack.
                </Text>
              </div>
              <Button onClick={openCreate} leftIcon={<Plus className="size-4" />}>
                Crear primer documento
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2/40">
                    <FileText className="size-4 text-foreground-dim" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Text className="font-bold truncate">{doc.title}</Text>
                      <Badge variant={SOURCE_BADGE_VARIANT[doc.source]} size="sm">
                        {KNOWLEDGE_SOURCE_LABELS[doc.source]}
                      </Badge>
                      {!doc.isActive && (
                        <Badge variant="outline" size="sm">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                    <Text variant="muted" size="xs">
                      {doc.chunkCount} fragmentos · {doc.contentLength.toLocaleString()} caracteres ·
                      Actualizado {formatDate(doc.updatedAt)}
                    </Text>
                  </div>
                  <Switch
                    checked={doc.isActive}
                    onCheckedChange={(checked) => void toggleActive(doc, checked)}
                    aria-label={`Activar ${doc.title}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(doc)}
                    title="Editar"
                    aria-label={`Editar ${doc.title}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(doc)}
                    title="Eliminar"
                    aria-label={`Eliminar ${doc.title}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={form.id ? "Editar documento" : "Nuevo documento"}
        description={
          form.id
            ? "Deja el contenido vacío para conservar el actual (sin reprocesar embeddings)."
            : "Se fragmenta automáticamente para búsqueda semántica del asistente."
        }
      >
        <form onSubmit={handleSave} className="space-y-5 py-2">
          <div className="space-y-1.5">
            <label htmlFor="kb-title" className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
              Título
            </label>
            <Input
              id="kb-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="¿Cómo funcionan los créditos IA?"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Tipo</label>
            <SimpleSelect
              options={SOURCE_OPTIONS}
              value={form.source}
              onChange={(value) => setForm((f) => ({ ...f, source: value as KnowledgeSource }))}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="kb-content" className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
              Contenido
            </label>
            <Textarea
              id="kb-content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder={form.id ? "(vacío = sin cambios)" : "Escribe aquí la información que debe conocer el asistente..."}
              className="min-h-[180px]"
              maxLength={20000}
            />
            <Text variant="muted" size="xs" className="text-right">
              {form.content.length.toLocaleString()} / 20.000 caracteres
            </Text>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outlined" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear documento"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar documento"
        description={`"${deleteTarget?.title ?? ""}" se eliminará junto con sus fragmentos embebidos. El asistente dejará de usar esta información.`}
        confirmText="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
