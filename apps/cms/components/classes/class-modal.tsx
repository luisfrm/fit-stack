"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { ClassForm } from "./class-form";
import { type ICmsClass } from "@/types/dashboard";
import { classesService } from "@/lib/services/classes-service";

interface ClassModalProps {
  readonly classData?: ICmsClass;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function ClassModal({ classData, trigger, onSuccess }: ClassModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!classData?.id;

  const handleSubmit = async (formData: Partial<ICmsClass>) => {
    setIsLoading(true);

    try {
      isEdit && classData?.id ?
        await classesService.updateClass(classData.id, formData) :
        await classesService.createClass(formData);

      const action = isEdit ? "actualizada" : "creada";
      toast.success(`Clase ${action} correctamente.`);

      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Algo salió mal";
      toast.error(message);
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
