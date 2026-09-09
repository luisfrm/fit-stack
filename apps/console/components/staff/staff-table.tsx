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
import { ShieldOff, ShieldCheck, User, Pencil } from "lucide-react";
import {
  canAssignPlatformRole,
  formatPlatformRole,
  type PlatformRole,
} from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import { paginate } from "@/lib/paginate";
import { staffService } from "@/lib/services/staff-service";
import type { PlatformStaffMember } from "@/lib/services/staff-service";
import { StaffRoleModal } from "./staff-role-modal";

/** Items por página de la tabla de staff. */
const MAX_ITEMS = 10;

const ROLE_BADGE_VARIANT: Record<
  string,
  "default" | "info" | "warning" | "outline"
> = {
  owner: "warning",
  admin: "default",
  support: "info",
};

function StaffMemberCell({ member }: { readonly member: PlatformStaffMember }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <ShieldCheck className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <Text as="span" size="base" weight="medium" truncate>
          {member.name}
        </Text>
        <Text
          as="span"
          size="xs"
          variant="muted"
          className="block truncate"
        >
          {member.email}
        </Text>
      </div>
    </div>
  );
}

function StaffRoleCell({ role }: { readonly role: string }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANT[role] ?? "outline"}>
      {formatPlatformRole(role)}
    </Badge>
  );
}

interface StaffActionsCellProps {
  readonly member: PlatformStaffMember;
  readonly canManage: boolean;
  readonly onEditRole: (member: PlatformStaffMember) => void;
  readonly onRevoke: (member: PlatformStaffMember) => void;
}

function StaffActionsCell({
  member,
  canManage,
  onEditRole,
  onRevoke,
}: StaffActionsCellProps) {
  if (!canManage) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onEditRole(member)}
        leftIcon={<Pencil className="size-4" />}
      >
        Cambiar rol
      </Button>
      <Button
        type="button"
        variant="ghost-danger"
        size="sm"
        onClick={() => onRevoke(member)}
        leftIcon={<ShieldOff className="size-4" />}
      >
        Revocar
      </Button>
    </div>
  );
}

const getColumns = (
  actorId?: string,
  actorRole: PlatformRole = "user",
  onEditRole?: (member: PlatformStaffMember) => void,
  onRevoke?: (member: PlatformStaffMember) => void,
): ColumnDef<PlatformStaffMember>[] => [
  {
    header: "Nombre",
    cell: (m) => <StaffMemberCell member={m} />,
  },
  {
    header: "Rol",
    cell: (m) => <StaffRoleCell role={m.role} />,
  },
  {
    header: "Acciones",
    cell: (m) => (
      <StaffActionsCell
        member={m}
        canManage={
          m.id !== actorId &&
          canAssignPlatformRole(actorRole, m.role as PlatformRole)
        }
        onEditRole={(target) => onEditRole?.(target)}
        onRevoke={(target) => onRevoke?.(target)}
      />
    ),
  },
];

interface StaffTableProps {
  staff: PlatformStaffMember[];
  onSuccess?: () => void;
}

export function StaffTable({ staff, onSuccess }: Readonly<StaffTableProps>) {
  const { user } = useAuth();
  const actorRole = (user?.role || "user") as PlatformRole;

  const [revokeTarget, setRevokeTarget] =
    React.useState<PlatformStaffMember | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [roleTarget, setRoleTarget] =
    React.useState<PlatformStaffMember | null>(null);
  const [page, setPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(staff.length / MAX_ITEMS));
  const safePage = Math.min(page, totalPages);
  const pageItems = paginate(staff, safePage, MAX_ITEMS);

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
      console.error("Error revoking access:", error);
      toast.error("No se pudo revocar el acceso");
    } finally {
      setIsRevoking(false);
    }
  };

  const columns = React.useMemo(
    () =>
      getColumns(
        user?.id,
        actorRole,
        setRoleTarget,
        (target) => {
          setRevokeTarget(target);
          setIsConfirmOpen(true);
        },
      ),
    [user?.id, actorRole],
  );

  return (
    <>
      <Table
        columns={columns}
        data={pageItems}
        className=""
        pagination={{
          page: safePage,
          totalPages,
          total: staff.length,
          limit: MAX_ITEMS,
          onPageChange: setPage,
        }}
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
        description={`¿Seguro que deseas revocar el acceso a la consola de ${revokeTarget?.email ?? "este usuario"
          }? Su rol volverá a "Usuario".`}
        confirmText="REVOCAR"
        variant="danger"
        isLoading={isRevoking}
        onConfirm={handleConfirmRevoke}
      />

      <StaffRoleModal
        member={roleTarget}
        open={roleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        onSuccess={onSuccess}
      />
    </>
  );
}
