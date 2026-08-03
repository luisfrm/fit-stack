"use client";

import * as React from "react";
import { Modal, toast } from "@workspace/ui/components";
import { StaffForm } from "./staff-form";
import { canAssignPlatformRole, platformRoles, type PlatformRole } from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import { staffService, type CreateStaffInput } from "@/lib/services/staff-service";

interface StaffModalProps {
  readonly trigger?: React.ReactNode;
  readonly onSuccess?: () => void;
}

export function StaffModal({ trigger, onSuccess }: StaffModalProps) {
  const { user } = useAuth();
  const actorRole = (user?.role || "user") as PlatformRole;
  const canAssign = Object.keys(platformRoles).some((role) =>
    canAssignPlatformRole(actorRole, role as PlatformRole),
  );

  const [internalOpen, setInternalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Anti-escalation UX: support (or any role without assign rights) doesn't see the button
  if (!canAssign) return null;

  const handleSubmit = async (data: CreateStaffInput) => {
    setIsSubmitting(true);
    try {
      const result = await staffService.create(data);

      if (result.status === "granted") {
        toast.success(`Acceso de plataforma otorgado a ${result.user?.email}.`);
      } else {
        toast.success(`Correo de registro enviado a ${result.email}.`);
      }

      setInternalOpen(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error?.data?.error ?? error?.message ?? "Algo salió mal");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={internalOpen}
      onOpenChange={setInternalOpen}
      trigger={trigger!}
      title="Agregar Administrador"
      description="Registra un nuevo miembro del equipo de administración de la plataforma SaaS Fit-Stack."
      isScrollable={true}
      size="md"
    >
      <StaffForm onSubmit={handleSubmit} isLoading={isSubmitting} />
    </Modal>
  );
}
