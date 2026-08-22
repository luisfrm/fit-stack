"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, toast } from "@workspace/ui/components";
import { contentService } from "@/lib/services/content-service";
import {
  PageCreationForm,
  type PageCreationFormValues,
} from "./page-creation-form";

interface PageCreationModalProps {
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function PageCreationModal({ trigger, onSuccess }: PageCreationModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleClose = React.useCallback(() => setIsOpen(false), []);

  const handleSubmit = React.useCallback(
    async (values: PageCreationFormValues) => {
      try {
        const newPage = await contentService.createPage({
          title: values.title,
          slug: values.slug,
          description: values.description,
          isActive: false,
        });
        toast.success("Página creada con éxito");
        handleClose();
        onSuccess?.();
        router.push(`/content/${newPage.id}`);
      } catch (error) {
        console.error("Error creating page:", error);
        toast.error("Error al crear la página");
      }
    },
    [onSuccess, handleClose, router],
  );

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title="Añadir Nueva Página"
      description="Completa los datos para crear una nueva página en el sistema."
    >
      <PageCreationForm onSubmit={handleSubmit} onCancel={handleClose} />
    </Modal>
  );
}
