"use client";

import * as React from "react";
import { Modal } from "@workspace/ui/components";
import {
  KnowledgeDocForm,
  type KnowledgeDocFormValues,
} from "./knowledge-doc-form";
import type { KnowledgeSource } from "@/lib/services/knowledge-service";

interface KnowledgeDocModalProps {
  readonly initialTitle?: string;
  readonly initialSource?: KnowledgeSource;
  readonly initialContent?: string;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSubmit: (values: KnowledgeDocFormValues) => Promise<void>;
}

export function KnowledgeDocModal({
  initialTitle,
  initialSource,
  initialContent,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSubmit,
}: KnowledgeDocModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (isControlled) {
        setControlledOpen?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, setControlledOpen],
  );

  const handleCancel = React.useCallback(() => handleOpenChange(false), [handleOpenChange]);
  const handleSubmit = React.useCallback(
    async (values: KnowledgeDocFormValues) => {
      try {
        await onSubmit(values);
        handleOpenChange(false);
      } catch {
        // onSubmit ya mostró toast; mantener modal abierto para no perder datos
      }
    },
    [onSubmit, handleOpenChange],
  );

  const isEdit = Boolean(initialTitle);

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      size="xl"
      isScrollable
      title={isEdit ? "Editar documento" : "Nuevo documento"}
      description={
        isEdit
          ? "Edita el contenido; si lo cambias se regeneran los embeddings."
          : "Se fragmenta automáticamente para búsqueda semántica del asistente."
      }
    >
      <KnowledgeDocForm
        initialTitle={initialTitle}
        initialSource={initialSource}
        initialContent={initialContent}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </Modal>
  );
}
