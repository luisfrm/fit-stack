"use client";

import * as React from "react";
import { type ICoach } from "@/types/dashboard";
import { Modal } from "@workspace/ui/components";
import { CoachForm } from "./coach-form";
import { 
  useCreateCoachMutation, 
  useUpdateCoachMutation 
} from "@/lib/services/coaches-service";

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
  
  const createMutation = useCreateCoachMutation();
  const updateMutation = useUpdateCoachMutation();

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const handleSubmit = async (data: Partial<ICoach>) => {
    try {
      if (isEdit && initialData.id) {
        await updateMutation.mutateAsync({ id: initialData.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      // Error handling is managed by the mutation hooks (toasts)
      console.error("Error submitting coach form:", error);
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
      <CoachForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Modal>
  );
}
