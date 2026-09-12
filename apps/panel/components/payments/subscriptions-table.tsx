"use client";

import * as React from "react";
import {
  Table,
  type ColumnDef,
  Badge,
  Text,
  ActionsDropdown
} from "@workspace/ui/components";
import { type ISubscription } from "@/types/dashboard";
import { PAYMENT_STATUSES, SUBSCRIPTION_STATUSES, PERMISSION_ACTIONS, PERMISSION_MODULES } from "@workspace/shared";
import {
  Ban,
  Trash2,
  CheckCircle2,
  CreditCard,
  Receipt,
  AlertCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { ReceiptDialog } from "./receipt-dialog";
import { formatCents, maskReference, type CurrencyFormat } from "@workspace/shared";
import { usePermissions, useAuth } from "@/lib/hooks/use-auth";
import { NoData } from "../dashboard/no-data";

const getPaymentStatusBadge = (status?: string) => {
  switch (status) {
    case PAYMENT_STATUSES.VALIDATED: return (
      <Badge variant="success" className="flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <CheckCircle2 size={12} /> Validado
      </Badge>
    );
    case PAYMENT_STATUSES.PROCESSING: return (
      <Badge variant="warning" className="flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <Clock size={12} /> Por Validar
      </Badge>
    );
    case PAYMENT_STATUSES.INVALID: return (
      <Badge variant="destructive" className="flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <XCircle size={12} /> Inválido
      </Badge>
    );
    case PAYMENT_STATUSES.VOIDED: return (
      <Badge variant="secondary" className="flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <AlertCircle size={12} /> Anulado
      </Badge>
    );
    default: return (
      <Badge variant="outline" className="text-[10px] opacity-50 px-2 py-0.5 pointer-events-none">
        N/A
      </Badge>
    );
  }
};

const getSubscriptionStatusBadge = (status: string) => {
  switch (status) {
    case SUBSCRIPTION_STATUSES.ACTIVE: return <Badge variant="success" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">ACTIVA</Badge>;
    case SUBSCRIPTION_STATUSES.CANCELLED: return <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">CANCELADA</Badge>;
    case SUBSCRIPTION_STATUSES.EXPIRED: return <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">EXPIRADA</Badge>;
    default: return <Badge variant="outline" className="pointer-events-none">{status}</Badge>;
  }
};

const getColumns = (
  onStatusChange: (id: number, status: string) => void | Promise<void>,
  onPaymentStatusChange: (paymentId: number, status: string) => void | Promise<void>,
  onDelete: (id: number) => void | Promise<void>,
  currencyFormat: CurrencyFormat,
  canDelete: boolean,
  onReceiptSuccess?: () => void | Promise<void>
): ColumnDef<ISubscription>[] => [
    {
      header: "Miembro",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <Text as="span" weight="bold" className="text-foreground hover:text-primary transition-colors cursor-pointer leading-tight">
            {sub.memberName || `User #${sub.memberId}`}
          </Text>
          <Text size="xs" variant="muted" className="font-mono opacity-50">
            ID: {sub.memberDocumentId || '---'}
          </Text>
        </div>
      )
    },
    {
      header: "Plan / Paquete",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Text as="span" size="sm" className="uppercase font-bold tracking-widest text-primary leading-tight">
              {sub.planName}
            </Text>
            {getSubscriptionStatusBadge(sub.status)}
          </div>
          <div className="flex flex-col">
            {sub.planSnapshotPrice !== undefined && (
              <Text as="span" size="xs" variant="muted" className="opacity-60 italic">
                Precio base: {formatCents(sub.planSnapshotPrice, sub.planSnapshotCurrency ?? sub.currencyPaid ?? 'USD', currencyFormat)}
              </Text>
            )}
          </div>
        </div>
      )
    },
    {
      header: "Vigencia",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-primary opacity-70" />
            <Text size="sm" className="font-bold tabular-nums">
              {new Date(sub.endDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </div>
          <Text size="xs" variant="muted" className="opacity-40 italic">
            Desde: {new Date(sub.startDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
          </Text>
        </div>
      )
    },
    {
      header: "Cobro Real",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
            <Text weight="bold" size="sm" className="text-foreground tabular-nums">
              {sub.amountPaid
                ? formatCents(sub.amountPaid, sub.currencyPaid ?? "USD", currencyFormat)
                : "---"
              }
          </Text>
          {sub.currencyPaid !== 'USD' && sub.exchangeRateApplied && (
            <Text size="xs" variant="muted" className="opacity-50 text-[10px] uppercase tracking-tighter">
              Tasa: {sub.exchangeRateApplied}
            </Text>
          )}
        </div>
      )
    },
    {
      header: "Método",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <CreditCard size={12} className="text-primary/70" />
            <Text size="sm" className="capitalize font-medium">
              {sub.paymentMethod?.replaceAll('_', ' ') || "N/A"}
            </Text>
          </div>
          {sub.paymentMethodDetails && (
            <Text size="xs" variant="muted" className="font-mono opacity-50">
              REF: {(() => {
                if (Array.isArray(sub.paymentMethodDetails)) {
                  const refField = sub.paymentMethodDetails.find(d =>
                    (d.label ?? '').toLowerCase().includes('ref') ||
                    (d.label ?? '').toLowerCase().includes('pago')
                  );
                  return refField?.value !== undefined && refField?.value !== null && refField?.value !== ""
                    ? maskReference(String(refField.value))
                    : "---";
                }
                const ref = (sub.paymentMethodDetails as Record<string, unknown>).reference;
                return typeof ref === "string" && ref ? maskReference(ref) : "---";
              })()}
            </Text>
          )}
        </div>
      )
    },
    {
      header: "Estado Cobro",
      cell: (sub) => (
        <div className="flex flex-col items-start gap-1">
          {getPaymentStatusBadge(sub.paymentStatus)}
          {sub.receiptVoided && (
            <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">
              Anulado
            </Badge>
          )}
        </div>
      )
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (sub) => {
        // Auditoría del comprobante: con número siempre se puede ver
        // (emitido, anulado o invalidado después de emitir); sin número
        // solo `validated` puede emitir. `processing`/`invalid` sin número
        // no ofrecen nada.
        const canViewReceipt =
          !!sub.receiptNumber || sub.paymentStatus === PAYMENT_STATUSES.VALIDATED;
        const receiptLabel = !sub.receiptNumber
          ? "Emitir comprobante"
          : sub.receiptVoided
            ? "Ver comprobante (Anulado)"
            : sub.paymentStatus === PAYMENT_STATUSES.VALIDATED
              ? "Reimprimir comprobante"
              : "Ver comprobante";
        return (
        <div className="flex justify-end">
          <ActionsDropdown
            modalData={sub}
            onSuccess={onReceiptSuccess}
            sections={[
              ...(canViewReceipt
                ? [
                    {
                      label: "Auditoría de Pago",
                      items: [
                        {
                          label: receiptLabel,
                          icon: <Receipt size={14} />,
                          variant: "primary" as const,
                          Modal: ReceiptDialog
                        }
                      ]
                    }
                  ]
                : []),
              {
                label: "Gestión Administrativa",
                items: [
                  {
                    label: "Validar Pago",
                    icon: <CheckCircle2 size={14} />,
                    show: sub.paymentStatus === 'processing',
                    onClick: () => sub.paymentId && onPaymentStatusChange(sub.paymentId, 'validated')
                  },
                  {
                    label: "Marcar como Inválido",
                    icon: <XCircle size={14} />,
                    variant: "amber",
                    show: sub.paymentStatus === 'processing',
                    onClick: () => sub.paymentId && onPaymentStatusChange(sub.paymentId, 'invalid')
                  },
                  {
                    label: "Anular Cobro",
                    icon: <AlertCircle size={14} />,
                    variant: "destructive",
                    show: sub.paymentStatus === 'validated',
                    onClick: () => sub.paymentId && onPaymentStatusChange(sub.paymentId, 'voided')
                  }
                ]
              },
              {
                label: "Suscripción",
                items: [
                  {
                    label: sub.status === "active" ? "Revocar Acceso" : "Restaurar Acceso",
                    icon: sub.status === "active" ? <Ban size={14} /> : <CheckCircle2 size={14} />,
                    variant: sub.status === "active" ? "amber" : "primary",
                    show: sub.paymentStatus !== PAYMENT_STATUSES.VOIDED && sub.paymentStatus !== PAYMENT_STATUSES.INVALID,
                    onClick: () => sub.id && onStatusChange(sub.id, sub.status === "active" ? "cancelled" : "active")
                  },
                  {
                    label: "Eliminar Registro",
                    icon: <Trash2 size={14} />,
                    variant: "destructive",
                    show: canDelete,
                    onClick: () => {
                      if (globalThis.confirm(`¿Seguro que deseas eliminar este registro de pago de ${sub.memberName}?`)) {
                        if (sub.id) onDelete(sub.id);
                      }
                    }
                  }
                ]
              }
            ]}
          />
        </div>
        );
      }
    }
  ];

interface SubscriptionsTableProps {
  readonly subscriptions: ISubscription[];
  readonly onDelete: (id: number) => void;
  readonly onStatusChange: (id: number, status: string) => void;
  readonly onPaymentStatusChange: (paymentId: number, status: string) => void;
  readonly loading?: boolean;
  readonly pagination?: any;
  /** Refresca la página tras acciones del comprobante (updateTag + refresh). */
  readonly onSuccess?: () => void | Promise<void>;
}

export function SubscriptionsTable({
  subscriptions,
  onDelete,
  onStatusChange,
  onPaymentStatusChange,
  loading,
  pagination,
  onSuccess
}: SubscriptionsTableProps) {
  const { activeOrganization } = useAuth();
  const { can } = usePermissions();
  const currencyFormat = (activeOrganization?.currencyFormat ?? "latam") as CurrencyFormat;

  const canDelete = can(PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.DELETE);

  const columns = React.useMemo(() => getColumns(
    onStatusChange,
    onPaymentStatusChange,
    onDelete,
    currencyFormat,
    canDelete,
    onSuccess
  ), [onStatusChange, onDelete, onPaymentStatusChange, currencyFormat, canDelete, onSuccess]);

  return (
    <Table
      className="min-h-[600px]"
      columns={columns}
      data={subscriptions}
      loading={loading}
      pagination={pagination}
      emptyState={
        <NoData
          icon={CreditCard}
          message="No hay cobros registrados en el historial financiero."
          className="py-20 w-full"
        />
      }
    />
  );
}
