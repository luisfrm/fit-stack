"use client";

import * as React from "react";
import { Modal } from "@workspace/ui/components";
import { ClassForm } from "./class-form";
import { type ICmsClass } from "@/types/dashboard";
import { useCreateClass, useUpdateClass } from "@/lib/hooks/use-classes";

interface ClassModalProps {
  readonly classData?: ICmsClass;
  readonly trigger: React.ReactNode;
}

export function ClassModal({ classData, trigger }: ClassModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const createMutation = useCreateClass();
  const updateMutation = useUpdateClass();

  const isEdit = !!classData?.id;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (formData: Partial<ICmsClass>) => {
    try {
      if (isEdit && classData?.id) {
        await updateMutation.mutateAsync({ id: classData.id, data: formData });
      } else {
        await createMutation.mutateAsync(formData);
      }
      setIsOpen(false);
    } catch {
      // Error handled in hook
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title={isEdit ? "Editar Clase" : "Nueva Clase"}
      description={
        isEdit
          ? `Actualiza la información de la clase ${classData.name}.`
          : "Completa los datos para dar de alta una nueva clase en el sistema."
      }
      isScrollable={true}
    >
      <ClassForm
        initialData={classData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Modal>
  );
}
