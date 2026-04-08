"use client";

import * as React from "react";
import { Table, ColumnDef, Button, Badge, toast, Avatar, AvatarImage, AvatarFallback, Text } from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { Edit2, Trash2, Mail, Loader2, User } from "lucide-react";
import { GLOBAL_ROLES } from "@workspace/shared";
import { MemberModal } from "./member-modal";
import { membersService } from "@/lib/services/members-service";
import { uploadService } from "@/lib/services/upload-service";
import { ValueConverter, CurrencyFormat } from "@/lib/utils/value-converters";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";

interface MembersTableProps {
  readonly members: IMember[];
  readonly onDelete: (id: number) => void;
  readonly onSuccess: () => void;
  readonly EditModal?: React.ComponentType<{
    initialData: IMember;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
  readonly loading?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
}

const getColumns = (
  onDelete: (id: number) => void,
  onSuccess: () => void,
  EditModal: React.ComponentType<{
    initialData: IMember;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>,
  currencyFormat: CurrencyFormat = "latam"
): ColumnDef<IMember>[] => [
    {
      header: "Miembro",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar size="default" className="size-9 border border-white/10">
            {m.imageUrl ? (
              <AvatarImage src={uploadService.getMediaUrl(m.imageUrl)} alt={m.firstName} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-white/5 text-xs">
              <User size={14} className="opacity-40" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-white truncate max-w-[180px]">
              {m.firstName} {m.lastName}
            </span>
            <span className="text-[10px] text-gray-400 truncate max-w-[180px] tracking-wider">
              {m.email}
            </span>
          </div>
        </div>
      )
    },
    {
      header: "Identificación",
      cell: (m) => (
        <span className="text-sm font-medium text-gray-300">
          {m.documentId ? ValueConverter.formatInteger(m.documentId, currencyFormat) : "—"}
        </span>
      )
    },
    {
      header: "Rol",
      cell: (m) => (
        <Badge variant={m.role === GLOBAL_ROLES.ADMIN ? "default" : "secondary"}>
          {m.role || "Sin rol"}
        </Badge>
      )
    },
    {
      header: "Estado",
      cell: (m) => (
        <Badge variant={m.isActive ? "default" : "destructive"}>
          {m.isActive ? "Activo" : "Inactivo"}
        </Badge>
      )
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (m) => (
        <div className="flex items-center justify-end">
          {!m.user && m.id && (
            <ResendInviteButton memberId={m.id} />
          )}
          <EditModal
            initialData={m}
            onSuccess={onSuccess}
            trigger={
              <Button variant="ghost" size="icon">
                <Edit2 size={16} className="text-gray-400" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => m.id && onDelete(m.id)}
            className="hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      )
    }
  ];

function ResendInviteButton({ memberId }: { readonly memberId: number }) {
  const [loading, setLoading] = React.useState(false);

  const handleResend = async () => {
    try {
      setLoading(true);
      await membersService.resendInvite(memberId);
      toast.success("Invitación enviada correctamente.");
    } catch (err: any) {
      toast.error(err.message || "Error al enviar invitación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleResend}
      disabled={loading}
      title="Reenviar invitación de registro"
    >
      {loading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Mail size={16} className="text-primary" />}
    </Button>
  );
}

export function MembersTable({
  members,
  onDelete,
  onSuccess,
  EditModal = MemberModal,
  loading,
  emptyTitle,
  emptyDescription
}: MembersTableProps) {
  const { settings } = useSettings();
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const columns = React.useMemo(() => getColumns(onDelete, onSuccess, EditModal, currencyFormat), [onDelete, onSuccess, EditModal, currencyFormat]);

  return (
    <Table
      columns={columns}
      data={members}
      loading={loading}
      emptyState={
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <Text variant="muted" size="lg" weight="bold">
            {emptyTitle || "No hay resultados"}
          </Text>
          <Text variant="muted" size="sm" className="max-w-[400px]">
            {emptyDescription || "No se encontraron registros que coincidan con la búsqueda."}
          </Text>
        </div>
      }
    />
  );
}
