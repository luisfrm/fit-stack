"use client";

import * as React from "react";
import {
  Table,
  type ColumnDef,
  Badge,
  Text,
  ActionsDropdown,
  toast
} from "@workspace/ui/components";
import { type ISubscription } from "@/types/dashboard";
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
import { financeService } from "@/lib/services/finance-service";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";

const getPaymentStatusBadge = (status?: string) => {
  switch (status) {
    case "validated": return (
      <Badge variant="success" className="border-none flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <CheckCircle2 size={12} /> Validado
      </Badge>
    );
    case "processing": return (
      <Badge variant="warning" className="border-none flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <Clock size={12} /> Procesando
      </Badge>
    );
    case "invalid": return (
      <Badge variant="destructive" className="border-none flex items-center gap-1 px-2 py-0.5 pointer-events-none">
        <XCircle size={12} /> Inválido
      </Badge>
    );
    case "voided": return (
      <Badge className="bg-slate-500/10 text-slate-400 border-none flex items-center gap-1 px-2 py-0.5 pointer-events-none">
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
    case "active": return <Badge variant="success" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">ACTIVA</Badge>;
    case "canceled": return <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">CANCELADA</Badge>;
    case "expired": return <Badge className="bg-slate-500/5 text-slate-400 border-slate-500/20 text-[10px] uppercase font-bold tracking-widest px-1.5 h-4 pointer-events-none">EXPIRADA</Badge>;
    default: return <Badge variant="outline" className="pointer-events-none">{status}</Badge>;
  }
};

const getColumns = (
  onStatusChange: (id: number, status: 'active' | 'canceled' | 'expired') => void,
  onPaymentStatusChange: (paymentId: number, status: string) => Promise<void>,
  onDelete: (id: number) => void,
  currencyFormat: CurrencyFormat
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
          {sub.price !== undefined && (
            <Text as="span" size="xs" variant="muted" className="opacity-60 italic">
              Precio: {ValueConverter.format(sub.price / 100, 'USD', currencyFormat)}
            </Text>
          )}
        </div>
      )
    },
    {
      header: "Cobro Real",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <Text weight="bold" size="sm" className="text-foreground tabular-nums">
            {sub.amountPaid
              ? ValueConverter.format(sub.amountPaid / 100, sub.currencyPaid || 'USD', currencyFormat)
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
                    d.label.toLowerCase().includes('ref') ||
                    d.label.toLowerCase().includes('pago')
                  );
                  return refField?.value || "---";
                }
                return sub.paymentMethodDetails.reference || "---";
              })()}
            </Text>
          )}
        </div>
      )
    },
    {
      header: "Estado Cobro",
      cell: (sub) => getPaymentStatusBadge(sub.paymentStatus)
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (sub) => (
        <div className="flex justify-end">
          <ActionsDropdown
            modalData={sub}
            sections={[
              {
                label: "Auditoría de Pago",
                items: [
                  {
                    label: "Ver Comprobante",
                    icon: <Receipt size={14} />,
                    variant: "primary",
                    Modal: ReceiptDialog
                  }
                ]
              },
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
                    onClick: () => sub.id && onStatusChange(sub.id, sub.status === "active" ? "canceled" : "active")
                  },
                  {
                    label: "Eliminar Registro",
                    icon: <Trash2 size={14} />,
                    variant: "destructive",
                    onClick: () => {
                      if (globalThis.confirm(`¿Seguro que deseas eliminar este registro de pago de ${sub.memberName}?`)) {
                        sub.id && onDelete(sub.id);
                      }
                    }
                  }
                ]
              }
            ]}
          />
        </div>
      )
    }
  ];

interface SubscriptionsTableProps {
  readonly subscriptions: ISubscription[];
  readonly onDelete: (id: number) => void;
  readonly onStatusChange: (id: number, status: 'active' | 'canceled' | 'expired') => void;
  readonly loading?: boolean;
}

import { NoData } from "../dashboard/dashboard-ui";

export function SubscriptionsTable({ subscriptions, onDelete, onStatusChange, loading }: SubscriptionsTableProps) {
  const { settings } = useSettings();
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const handlePaymentStatusChange = async (paymentId: number, status: string) => {
    try {
      await financeService.updatePaymentStatus(paymentId, status);
      toast.success("Estado de pago actualizado correctamente");
      // Forzar recarga de la data desde el server component
      globalThis.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar estado");
    }
  };

  const columns = React.useMemo(() => getColumns(
    onStatusChange,
    handlePaymentStatusChange,
    onDelete,
    currencyFormat
  ), [onStatusChange, onDelete, currencyFormat]);

  return (
    <Table
      columns={columns}
      data={subscriptions}
      loading={loading}
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
