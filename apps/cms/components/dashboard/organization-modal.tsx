"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { OrganizationForm } from "./organization-form";
import { organizationsService } from "@/lib/services/organizations-service";
import { type IPlatformOrganization } from "@workspace/shared";

interface OrganizationModalProps {
  readonly initialData?: IPlatformOrganization;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function OrganizationModal({
  initialData,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: OrganizationModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (value: boolean) => {
    if (isControlled) {
      setControlledOpen?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  const handleSuccess = () => {
    handleOpenChange(false);
    onSuccess?.();
  };

  const isEdit = !!initialData?.id;

  const handleSubmit = async (formData: Partial<IPlatformOrganization>) => {
    try {
      if (isEdit && initialData?.id) {
        await organizationsService.update(initialData.id, formData as any);
        toast.success("Organización actualizada correctamente.");
      } else {
        await organizationsService.create(formData as any);
        toast.success("Organización creada exitosamente.");
      }
      handleSuccess();
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Algo salió mal";
      toast.error(message);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger!}
      title={isEdit ? "Editar Organización" : "Nueva Organización"}
      description={
        isEdit
          ? `Actualiza la información y configuración de ${initialData?.name}.`
          : "Completa los datos para dar de alta a una nueva entidad en la plataforma SaaS."
      }
      isScrollable={true}
    >
      <OrganizationForm
        initialData={initialData}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
