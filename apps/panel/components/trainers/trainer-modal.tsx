"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ITrainer } from "@workspace/shared/types";
import { Modal, toast } from "@workspace/ui/components";
import { TrainerForm } from "./trainer-form";
import { trainersService } from "@/lib/services/trainers-service";

interface TrainerModalProps {
  readonly initialData?: ITrainer;
  readonly onSuccess?: () => void;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function TrainerModal({
  initialData,
  onSuccess,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: TrainerModalProps) {
  const router = useRouter();
  const isEdit = !!initialData?.id;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const handleSubmit = async (data: Partial<ITrainer>) => {
    setIsLoading(true);
    try {
      if (isEdit && initialData.id) {
        await trainersService.updateTrainer(initialData.id, data);
        toast.success("Entrenador actualizado correctamente");
      } else {
        await trainersService.createTrainer(data);
        toast.success("Entrenador creado correctamente");
      }
      setOpen(false);
      onSuccess?.();
      router.refresh();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Error al guardar entrenador";
      toast.error(message);
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
      <TrainerForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Modal>
  );
}
