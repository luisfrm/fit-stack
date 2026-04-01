"use client";

import * as React from "react";
import { Table, ColumnDef, Button, Badge, toast } from "@workspace/ui/components";
import { type IMember, type Role } from "@/types/dashboard";
import { Edit2, Trash2, ShieldCheck, Mail, Loader2 } from "lucide-react";
import { MemberModal } from "./member-modal";
import { membersService } from "@/lib/services/members-service";

interface MembersTableProps {
  readonly members: IMember[];
  readonly onDelete: (id: number) => void;
  readonly onSuccess: () => void;
  readonly loading?: boolean;
}

const getRoleBadgeColor = (role: Role) => {
  switch (role) {
    case "admin": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "manager": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "trainer": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "client": return "bg-green-500/10 text-green-500 border-green-500/20";
    default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  }
};

const getRoleText = (role: Role) => {
  switch (role) {
    case "admin": return "Admin";
    case "manager": return "Manager";
    case "trainer": return "Entrenador";
    case "client": return "Cliente";
    default: return role;
  }
};

const ResendInviteButton = ({ member }: { member: IMember }) => {
  const [loading, setLoading] = React.useState(false);

  const handleResend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.id) return;

    setLoading(true);
    try {
      await membersService.resendInvite(member.id);
      toast.success(`Invitación reenviada a ${member.email}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Error al reenviar invitación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-primary hover:bg-primary/10"
      onClick={handleResend}
      disabled={loading}
      title="Reenviar Invitación"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
    </Button>
  );
};

const getColumns = (
  onDelete: (id: number) => void,
  onSuccess: () => void
): ColumnDef<IMember>[] => [
    {
      header: "Miembro",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (m) => (
        <div className="flex flex-col">
          <span className="font-semibold text-white truncate max-w-[200px]">
            {m.firstName} {m.lastName}
          </span>
          <span className="text-xs text-gray-400 truncate max-w-[200px]">
            {m.email}
          </span>
        </div>
      )
    },
    {
      header: "Rol",
      cell: (m) => (
        <Badge variant="outline" className={getRoleBadgeColor(m.role)}>
          {getRoleText(m.role)}
        </Badge>
      )
    },
    {
      header: "Identificación",
      cell: (m) => (
        <span className="text-sm text-gray-400">
          {m.documentId || "—"}
        </span>
      )
    },
    {
      header: "Sesión",
      cell: (m) => (
        <Badge variant={m.userId ? "default" : "outline"} className={m.userId ? "border-primary text-black" : "text-gray-500"}>
          {m.userId ? "Vinculado" : "Pendiente"}
        </Badge>
      )
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (m) => (
        <div className="flex justify-end gap-2">
          <MemberModal
            member={m}
            onSuccess={onSuccess}
            trigger={
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" title="Editar">
                <Edit2 size={16} />
              </Button>
            }
          />
          {!m.userId && <ResendInviteButton member={m} />}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
            onClick={(e) => {
              e.stopPropagation();
              if (globalThis.confirm(`¿Seguro que deseas eliminar a ${m.firstName}?`)) {
                if (m.id) onDelete(m.id);
              }
            }}
            title="Eliminar"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      )
    }
  ];

import { NoData } from "@/components/dashboard/dashboard-ui";

export function MembersTable({ members, onDelete, onSuccess, loading }: MembersTableProps) {
  const columns = React.useMemo(() => getColumns(onDelete, onSuccess), [onDelete, onSuccess]);

  const emptyState = (
    <NoData
      icon={ShieldCheck}
      message="No se encontraron miembros. Intenta ajustando los filtros o crea un nuevo miembro."
      className="py-12"
    />
  );

  return (
    <Table
      columns={columns}
      data={members}
      loading={loading}
      emptyState={emptyState}
    />
  );
}
