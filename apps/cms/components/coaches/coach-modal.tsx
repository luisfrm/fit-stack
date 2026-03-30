"use client";

import * as React from "react";
import { type ICoach } from "@/types/dashboard";
import { Modal, toast } from "@workspace/ui/components";
import { CoachForm } from "./coach-form";
import { coachesService } from "@/lib/services/coaches-service";

interface CoachModalProps {
  readonly initialData?: ICoach;
  readonly onSuccess?: () => void;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function CoachModal({
  initialData,
  onSuccess,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: CoachModalProps) {
  const isEdit = !!initialData?.id;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const handleSubmit = async (data: Partial<ICoach>) => {
    setIsLoading(true);
    try {
      if (isEdit && initialData.id) {
        await coachesService.updateCoach(initialData.id, data);
        toast.success("Entrenador actualizado exitosamente.");
      } else {
        await coachesService.createCoach(data);
        toast.success("Entrenador creado exitosamente.");
      }
      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Error al guardar el entrenador.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={isEdit ? "Editar Entrenador" : "Nuevo Entrenador"}
      description={
        isEdit
          ? "Modifica los datos del entrenador."
          : "Ingresa los datos del nuevo entrenador para el gimnasio."
      }
      isScrollable={true}
    >
      <CoachForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Modal>
  );
}
