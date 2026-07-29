"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, toast } from "@workspace/ui/components";
import { ClassForm } from "./class-form";
import { type IGymClass } from "@workspace/shared/types";
import { classesService } from "@/lib/services/classes-service";

interface ClassModalProps {
  readonly classData?: IGymClass;
  readonly trigger: React.ReactNode;
}

export function ClassModal({ classData, trigger }: ClassModalProps) {
  const router = useRouter();
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
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Algo salió mal";
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
