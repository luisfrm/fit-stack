"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { MemberForm } from "./member-form";
import { type IMember } from "@/types/dashboard";

interface MemberModalProps {
  /**
   * Optional member data. If provided, the modal acts as "Edit Member".
   */
  member?: IMember;
  /**
   * The button or element that opens the modal
   */
  trigger: React.ReactNode;
}

export function MemberModal({ member, trigger }: MemberModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const isEdit = !!member?.id;

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    
    // MOCKED SUBMIT
    console.log("Submitting Member Data:", formData);
    
    // Simulation
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    const action = isEdit ? "actualizado" : "creado";
    toast.success(`Miembro ${action} correctamente.`);
    
    setIsLoading(false);
    setIsOpen(false);
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
