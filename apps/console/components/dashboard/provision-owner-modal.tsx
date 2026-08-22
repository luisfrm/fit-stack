"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { ORG_ROLES } from "@workspace/shared/constants";
import { organizationsService } from "@/lib/services/organizations-service";
import {
  ProvisionOwnerForm,
  type ProvisionOwnerFormValues,
} from "./provision-owner-form";

interface ProvisionOwnerModalProps {
  readonly organizationId: string;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function ProvisionOwnerModal({
  organizationId,
  trigger,
  onSuccess,
}: ProvisionOwnerModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleClose = React.useCallback(() => setIsOpen(false), []);

  const handleSubmit = React.useCallback(
    async (values: ProvisionOwnerFormValues) => {
      try {
        await organizationsService.provisionOwner(
          organizationId,
          {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            role: ORG_ROLES.OWNER,
            isActive: true,
          },
          values.sendInvite,
        );
        toast.success("Propietario registrado exitosamente.");
        handleClose();
        onSuccess?.();
      } catch (error: any) {
        console.error("Error provisioning owner:", error);
        toast.error("Error al registrar propietario");
      }
    },
    [organizationId, onSuccess, handleClose],
  );

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title="Agregar Propietario de Sede"
      description="Registra al usuario principal con rol Owner para administrar esta sede."
    >
      <ProvisionOwnerForm onSubmit={handleSubmit} onCancel={handleClose} />
    </Modal>
  );
}
