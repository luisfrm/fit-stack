"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { ClassForm } from "./class-form";
import { type IGymClass } from "@workspace/shared/types";
import { classesService } from "@/lib/services/classes-service";

interface ClassModalProps {
  readonly classData?: IGymClass;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => Promise<void> | void;
}

export function ClassModal({ classData, trigger, onSuccess }: ClassModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!classData?.id;

  const handleSubmit = async (formData: Partial<IGymClass>) => {
    setIsLoading(true);
    try {
      if (isEdit && classData?.id) {
        await classesService.updateClass(classData.id, formData);
        toast.success("Clase actualizada correctamente");
      } else {
        await classesService.createClass(formData);
        toast.success("Clase creada correctamente");
      }
      await onSuccess?.();
      setIsOpen(false);
    } catch (error) {
      const fallbackMsg = isEdit
        ? "Error al actualizar la clase. Intente más tarde."
        : "Error al crear la clase. Intente más tarde.";
      toast.error(fallbackMsg);
    } finally {
      setIsLoading(false);
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
