"use client";

import * as React from "react";
import { type ITrainer } from "@/types/dashboard";
import { Modal } from "@workspace/ui/components";
import { TrainerForm } from "./trainer-form";
import {
  useCreateTrainerMutation,
  useUpdateTrainerMutation
} from "@/lib/services/trainers-service";

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
  const isEdit = !!initialData?.id;
  const [internalOpen, setInternalOpen] = React.useState(false);

  const createMutation = useCreateTrainerMutation();
  const updateMutation = useUpdateTrainerMutation();

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const handleSubmit = async (data: Partial<ITrainer>) => {
    try {
      if (isEdit && initialData.id) {
        await updateMutation.mutateAsync({ id: initialData.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting trainer form:", error);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

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