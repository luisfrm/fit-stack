"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { MemberForm } from "./member-form";
import { type IMember } from "@/types/dashboard";
import { membersService } from "@/lib/services/members-service";

interface MemberModalProps {
  readonly member?: IMember;
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function MemberModal({ member, trigger, onSuccess }: MemberModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!member?.id;

  const handleSubmit = async (formData: Partial<IMember>, sendInvite: boolean) => {
    setIsLoading(true);
    
    try {
      if (isEdit && member?.id) {
        await membersService.updateMember(member.id, formData);
        toast.success("Miembro actualizado correctamente.");
      } else {
        await membersService.createMember(formData, sendInvite);
        toast.success("Miembro creado exitosamente.");
        if (sendInvite) {
          toast.success("Se ha programado el envío de la invitación.", { description: "Revisa la consola (o bandeja de correo) para ver el link mágico." });
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
          ? `Actualiza la información de ${member.firstName} ${member.lastName}.` 
          : "Completa los datos para dar de alta a un nuevo miembro en el gimnasio."
      }
      isScrollable={true}
    >
      <MemberForm 
        initialData={member} 
        onSubmit={handleSubmit} 
        isLoading={isLoading} 
      />
    </Modal>
  );
}
