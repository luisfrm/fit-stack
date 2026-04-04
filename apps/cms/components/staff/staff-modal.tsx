"use client";

import * as React from "react";
import { Modal } from "@workspace/ui/components";
import { StaffForm } from "./staff-form";
import { type IMember } from "@/types/dashboard";
import { membersService } from "@/lib/services/members-service";

interface StaffModalProps {
  readonly initialData?: IMember;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function StaffModal({
  initialData,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSuccess,
}: StaffModalProps) {
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

  const handleSubmit = async (data: Partial<IMember>, sendInvite: boolean) => {
    if (isEdit && initialData?.id) {
      await membersService.updateMember(initialData.id, data);
    } else {
      await membersService.createMember(data, sendInvite);
    }
    handleSuccess();
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger!}
      size="xl"
      isScrollable={true}
      title={isEdit ? "Editar Miembro de Staff" : "Añadir Nuevo Staff"}
      description={isEdit 
        ? "Actualiza los datos administrativos y permisos del usuario." 
        : "Completa los datos para invitar a un nuevo administrador o manager al sistema."}
    >
      <StaffForm 
        initialData={initialData} 
        onSubmit={handleSubmit} 
      />
    </Modal>
  );
}
