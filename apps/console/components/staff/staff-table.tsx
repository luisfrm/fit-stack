"use client";

import * as React from "react";
import {
  Table,
  Badge,
  Button,
  Text,
  ConfirmationModal,
  toast,
  type ColumnDef,
} from "@workspace/ui/components";
import { ShieldOff, ShieldCheck, User } from "lucide-react";
import { canAssignPlatformRole, formatPlatformRole, type PlatformRole } from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import { staffService } from "@/lib/services/staff-service";
import type { PlatformStaffMember } from "@/lib/services/staff-service";

const ROLE_BADGE_VARIANT: Record<string, "default" | "info" | "warning" | "outline"> = {
  owner: "warning",
  admin: "default",
  support: "info",
};

interface StaffTableProps {
  staff: PlatformStaffMember[];
  onSuccess?: () => void;
}

export function StaffTable({ staff, onSuccess }: StaffTableProps) {
  const { user } = useAuth();
  const actorRole = (user?.role || "user") as PlatformRole;

  const [revokeTarget, setRevokeTarget] = React.useState<PlatformStaffMember | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [isRevoking, setIsRevoking] = React.useState(false);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await staffService.revoke(revokeTarget.id);
      toast.success(`Acceso revocado a ${revokeTarget.email}.`);
      setIsConfirmOpen(false);
      setRevokeTarget(null);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error?.data?.error ?? error?.message ?? "No se pudo revocar el acceso");
    } finally {
      setIsRevoking(false);
    }
  };

  const canRevoke = (member: PlatformStaffMember) =>
    member.id !== user?.id &&
    canAssignPlatformRole(actorRole, member.role as PlatformRole);

  const columns: ColumnDef<PlatformStaffMember>[] = [
    {
      header: "Nombre",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <Text as="span" size="base" weight="medium" truncate>
              {m.name}
            </Text>
            <Text as="span" size="xs" variant="muted" className="block truncate">
              {m.email}
            </Text>
          </div>
        </div>
      ),
    },
    {
      header: "Rol",
      cell: (m) => (
        <Badge variant={ROLE_BADGE_VARIANT[m.role] ?? "outline"}>
          {formatPlatformRole(m.role)}
        </Badge>
      ),
    },
    {
      header: "Estado",
      cell: (m) => (
        <Badge variant={m.emailVerified ? "success" : "outline"}>
          {m.emailVerified ? "Verificado" : "Sin verificar"}
        </Badge>
      ),
    },
    {
      header: "Acciones",
      cell: (m) =>
        canRevoke(m) ? (
          <Button
            type="button"
            variant="ghost-danger"
            size="sm"
            onClick={() => {
              setRevokeTarget(m);
              setIsConfirmOpen(true);
            }}
            leftIcon={<ShieldOff className="size-4" />}
          >
            Revocar
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        data={staff}
        emptyState={
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="size-12 rounded-full bg-foreground/5 flex items-center justify-center">
              <User className="size-6 text-foreground-dim" />
            </div>
            <Text variant="muted" size="sm">
              No hay staff de plataforma registrado todavía.
            </Text>
          </div>
        }
      />

      <ConfirmationModal
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Revocar acceso"
        description={`¿Seguro que deseas revocar el acceso a la consola de ${
          revokeTarget?.email ?? "este usuario"
        }? Su rol volverá a "Usuario".`}
        confirmText="REVOCAR"
        variant="danger"
        isLoading={isRevoking}
        onConfirm={handleConfirmRevoke}
      />
    </>
  );
}
