"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Library, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Switch,
  Text,
  Title,
  ConfirmationModal,
  toast,
} from "@workspace/ui/components";
import type { KnowledgeDoc } from "@/lib/services/knowledge-service";
import {
  KNOWLEDGE_SOURCE_LABELS,
  knowledgeService,
} from "@/lib/services/knowledge-service";
import { KnowledgeDocModal } from "@/components/knowledge/knowledge-doc-modal";

const SOURCE_BADGE_VARIANT: Record<KnowledgeDoc["source"], "default" | "info" | "warning"> = {
  faq: "info",
  policy: "warning",
  settings: "default",
};

interface KnowledgeSettingsProps {
  readonly initialDocs: KnowledgeDoc[];
  readonly onSaved?: () => void | Promise<void>;
}

export function KnowledgeSettings({ initialDocs, onSaved }: KnowledgeSettingsProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"closed" | "create" | { edit: KnowledgeDoc; content: string }>("closed");
  const [deleteTarget, setDeleteTarget] = React.useState<KnowledgeDoc | null>(null);

  const refresh = async () => {
    await onSaved?.();
    router.refresh();
  };

  const openCreate = () => setMode("create");
  const openEdit = async (doc: KnowledgeDoc) => {
    // Abre modal de inmediato con contenido vacío y luego carga solo el texto (sin chunks)
    setMode({ edit: doc, content: "" });
    try {
      const { data } = await knowledgeService.getContent(doc.id);
      setMode({ edit: doc, content: data.content });
    } catch (error) {
      console.error("Error loading document for edit:", error);
      toast.error("Error al cargar el documento");
      setMode("closed");
    }
  };
  const closeModal = () => setMode("closed");

  const handleSave = async (values: {
    title: string;
    source: KnowledgeDoc["source"];
    content: string;
  }) => {
    try {
      if (mode === "create") {
        await knowledgeService.create(values);
        toast.success("Documento creado y procesado correctamente");
      } else if (mode !== "closed") {
        const original = mode.content;
        const payload: Partial<{ title: string; source: KnowledgeDoc["source"]; content: string }> = {
          title: values.title,
          source: values.source,
        };
        // Solo re-embebe si el contenido cambió realmente
        if (values.content.trim() && values.content.trim() !== original.trim()) {
          payload.content = values.content;
        }
        await knowledgeService.update(mode.edit.id, payload);
        toast.success("Documento actualizado correctamente");
      }
      await refresh();
    } catch (error) {
      console.error("Error saving knowledge document:", error);
      toast.error("Error al guardar el documento");
      throw error;
    }
  };

  const toggleActive = async (doc: KnowledgeDoc, isActive: boolean) => {
    try {
      await knowledgeService.update(doc.id, { isActive });
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
      console.error("Error deleting knowledge document:", error);
      toast.error("Error al eliminar el documento");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  const modalState = (() => {
    if (mode === "create") {
      return { open: true, initialTitle: undefined, initialSource: undefined as never, initialContent: "" };
    }
    if (mode !== "closed") {
      return {
        open: true,
        initialTitle: mode.edit.title,
        initialSource: mode.edit.source,
        initialContent: mode.content,
      };
    }
    return null;
  })();

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
              <Text className="font-bold">
                {initialDocs.filter((d) => d.isActive).length} documentos activos en la plataforma
              </Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">
                Se fragmentan automáticamente para búsqueda semántica
              </Text>
            </div>
          </div>
        </Card>

        <Card id="knowledge-docs-list" variant="settings" className="p-0 sm:p-0 overflow-hidden">
          {initialDocs.length === 0 ? (
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
              {initialDocs.map((doc) => (
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

      <KnowledgeDocModal
        open={modalState?.open ?? false}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        initialTitle={modalState?.initialTitle}
        initialSource={modalState?.initialSource}
        initialContent={modalState?.initialContent ?? ""}
        onSubmit={handleSave}
      />

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
