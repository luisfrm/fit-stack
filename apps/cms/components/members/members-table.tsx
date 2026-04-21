"use client";

import * as React from "react";
import { Table, ColumnDef, Button, Badge, toast, Text, SimpleTooltip, NextImage } from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { Edit2, Trash2, Mail, Loader2, User, CreditCard, Plus } from "lucide-react";
import { GLOBAL_ROLES } from "@workspace/shared";
import { MemberModal } from "./member-modal";
import { membersService } from "@/lib/services/members-service";
import { uploadService } from "@/lib/services/upload-service";
import { ValueConverter, CurrencyFormat } from "@/lib/utils/value-converters";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { differenceInDays, parseISO } from "date-fns";

interface MembersTableProps {
  readonly members: IMember[];
  readonly onDelete: (id: number) => void;
  readonly onSuccess: () => void;
  readonly EditModal?: React.ComponentType<{
    initialData: IMember;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
  readonly SubscriptionModal?: React.ComponentType<{
    initialMember: IMember;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
  readonly hideRoleColumn?: boolean;
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
  currencyFormat: CurrencyFormat = "latam",
  hideRoleColumn?: boolean,
  SubscriptionModal?: React.ComponentType<{
    initialMember: IMember;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>
): ColumnDef<IMember>[] => [
    {
      header: "Miembro",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full border border-white/10 bg-white/5 overflow-hidden flex items-center justify-center shrink-0">
            {m.imageUrl ? (
              <NextImage
                src={uploadService.getMediaUrl(m.imageUrl)}
                alt={`${m.firstName} ${m.lastName}`}
                width={36}
                height={36}
                className="size-full object-cover"
              />
            ) : (
              <User size={18} className="text-muted-foreground/60" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-foreground truncate max-w-[180px]">
              {m.firstName} {m.lastName}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[180px] tracking-wider">
              {m.email}
            </span>
          </div>
        </div>
      )
    },
    {
      header: "Identificación",
      cell: (m) => (
        <span className="text-muted-foreground text-sm font-medium">
          {m.documentId ? ValueConverter.formatInteger(m.documentId, currencyFormat) : "—"}
        </span>
      )
    },
    ...(hideRoleColumn ? [] : [{
      header: "Rol",
      cell: (m: IMember) => (
        <Badge variant={m.role === GLOBAL_ROLES.ADMIN ? "default" : "secondary"}>
          {m.role || "Sin rol"}
        </Badge>
      )
    }]),
    {
      header: "Suscripción",
      cell: (m: IMember) => {
        const sub = m.latestSubscription;
        if (!sub) {
          return <Badge className="pointer-events-none" variant="warning">Sin suscripción</Badge>;
        }

        const end = parseISO(sub.endDate);
        const daysLeft = differenceInDays(end, new Date());

        let variant: "success" | "warning" | "destructive" = "success";
        if (sub.status !== 'active' || daysLeft < 0) {
          variant = "destructive";
        } else if (daysLeft <= 7) {
          variant = "warning";
        }

        return (
          <div className="flex flex-col gap-1">
            <Badge variant={variant} size="sm">
              {sub.planName || "Plan personalizado"}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-medium">
              Expira: {ValueConverter.formatDate(sub.endDate, currencyFormat)}
            </span>
          </div>
        );
      }
    },
    {
      header: "Estado",
      cell: (m: IMember) => (
        <Badge variant={m.isActive ? "default" : "destructive"}>
          {m.isActive ? "Activo" : "Inactivo"}
        </Badge>
      )
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (m: IMember) => (
        <div className="flex items-center justify-end">
          {SubscriptionModal && m.isActive && (
            <SubscriptionModal
              initialMember={m}
              onSuccess={onSuccess}
              trigger={
                <SimpleTooltip content="Registrar Pago / Suscripción">
                  <Button
                    variant="ghost-accent"
                    size="icon"
                  >
                    <CreditCard size={16} />
                    <Plus size={8} className="absolute top-2 right-2" />
                  </Button>
                </SimpleTooltip>
              }
            />
          )}
          {!m.user && m.id && (
            <SimpleTooltip content="Reenviar invitación de registro">
              <ResendInviteButton memberId={m.id} />
            </SimpleTooltip>
          )}
          <EditModal
            initialData={m}
            onSuccess={onSuccess}
            trigger={
              <SimpleTooltip content="Editar información">
                <Button
                  variant="ghost-accent"
                  size="icon"
                >
                  <Edit2 size={16} />
                </Button>
              </SimpleTooltip>
            }
          />
          <SimpleTooltip content="Eliminar miembro">
            <Button
              variant="ghost-danger"
              size="icon"
              onClick={() => m.id && onDelete(m.id)}
            >
              <Trash2 size={16} />
            </Button>
          </SimpleTooltip>
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
    <SimpleTooltip content="Reenviar invitación de registro">
      <Button
        variant="ghost-accent"
        size="icon"
        onClick={handleResend}
        disabled={loading}
      >
        {loading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Mail size={16} />}
      </Button>
    </SimpleTooltip>
  );
}

export function MembersTable({
  members,
  onDelete,
  onSuccess,
  EditModal = MemberModal,
  SubscriptionModal,
  hideRoleColumn,
  loading,
  emptyTitle,
  emptyDescription
}: MembersTableProps) {
  const { settings } = useSettings();
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const columns = React.useMemo(
    () => getColumns(onDelete, onSuccess, EditModal, currencyFormat, hideRoleColumn, SubscriptionModal),
    [onDelete, onSuccess, EditModal, currencyFormat, hideRoleColumn, SubscriptionModal]
  );

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
