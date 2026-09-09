"use client";

import * as React from "react";
import { Modal, Button, SimpleSelect, toast } from "@workspace/ui/components";
import {
  canAssignPlatformRole,
  formatPlatformRole,
  platformRoles,
  PLATFORM_ROLE_LABELS,
  type PlatformRole,
} from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import { mutationError } from "@/lib/errors";
import {
  staffService,
  type PlatformStaffMember,
} from "@/lib/services/staff-service";

const ROLE_OPTIONS = Object.keys(platformRoles).map((role) => ({
  value: role,
  label: PLATFORM_ROLE_LABELS[role] ?? role,
}));

interface StaffRoleModalProps {
  readonly member: PlatformStaffMember | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function StaffRoleModal({
  member,
  open,
  onOpenChange,
  onSuccess,
}: StaffRoleModalProps) {
  const { user } = useAuth();
  const actorRole = (user?.role || "user") as PlatformRole;

  const [role, setRole] = React.useState<string>("admin");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  // Anti-escalation: solo los roles que el actor puede asignar.
  const assignableRoles = ROLE_OPTIONS.filter((opt) =>
    canAssignPlatformRole(actorRole, opt.value as PlatformRole),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setIsSubmitting(true);
    try {
      // Email existente → el backend actualiza su rol global (con
      // anti-escalation en servidor). sendInvite no aplica aquí.
      const result = await staffService.create({
        email: member.email,
        role,
        sendInvite: false,
      });
      if (result.status === "granted") {
        toast.success(
          `Rol actualizado a ${formatPlatformRole(role)} para ${member.email}.`,
        );
      } else {
        toast.success(`Correo de registro enviado a ${result.email}.`);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(
        mutationError("StaffRoleModal", error, "No se pudo actualizar el rol"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      trigger={null}
      title="Cambiar rol"
      description={
        member
          ? `Selecciona el nuevo rol de plataforma para ${member.email}.`
          : undefined
      }
      size="md"
    >
      {assignableRoles.length === 0 ? (
        <p className="text-sm text-foreground-muted py-10 text-center">
          Tu rol no permite asignar roles de plataforma.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
          <SimpleSelect
            label="Rol de Plataforma"
            value={role}
            onChange={setRole}
            options={assignableRoles}
          />
          <div className="pt-4">
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              GUARDAR CAMBIOS
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
