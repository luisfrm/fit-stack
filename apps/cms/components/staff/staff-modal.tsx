"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@workspace/ui/components";
import { StaffForm } from "./staff-form";
import { type IMember } from "@/types/dashboard";

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
    // Dynamic import to avoid circular dependency if any
    const { membersService } = await import("@/lib/services/members-service");
    if (isEdit && initialData?.id) {
      await membersService.updateMember(initialData.id, data);
    } else {
      await membersService.createMember(data, sendInvite);
    }
    handleSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[600px] bg-slate-900 border-white/10 text-white max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight text-white">
              {isEdit ? "Editar Miembro de Staff" : "Añadir Nuevo Staff"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {isEdit 
                ? "Actualiza los datos administrativos y permisos del usuario." 
                : "Completa los datos para invitar a un nuevo administrador o manager al sistema."}
            </DialogDescription>
          </DialogHeader>

          <StaffForm 
            initialData={initialData} 
            onSubmit={handleSubmit} 
          />
      </DialogContent>
    </Dialog>
  );
}
