"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { MemberForm } from "./member-form";
import { type IMember } from "@/types/dashboard";
import { membersService } from "@/lib/services/members-service";

interface MemberModalProps {
  readonly initialData?: IMember;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function MemberModal({ initialData, trigger, onSuccess }: MemberModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!initialData?.id;

  const handleSubmit = async (formData: Partial<IMember>, sendInvite: boolean) => {
    setIsLoading(true);

    try {
      if (isEdit && initialData?.id) {
        await membersService.updateMember(initialData.id, formData);
        toast.success("Miembro actualizado correctamente.");
      } else {
        await membersService.createMember(formData, sendInvite);
        toast.success("Miembro creado exitosamente.");
        if (sendInvite) {
          toast.success("Se ha programado el envío de la invitación.", { description: "Se ha enviado un correo electrónico al nuevo miembro con un enlace para configurar su contraseña." });
        }
      }

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
      title={isEdit ? "Editar Miembro" : "Nuevo Miembro"}
      description={
        isEdit
          ? `Actualiza la información de ${initialData.firstName} ${initialData.lastName}.`
          : "Completa los datos para dar de alta a un nuevo miembro en el gimnasio."
      }
      isScrollable={true}
    >
      <MemberForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Modal>
  );
}
