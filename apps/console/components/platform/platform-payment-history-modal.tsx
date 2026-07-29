"use client";

import * as React from "react";
import {
  Modal,
  Table,
  type ColumnDef,
  Text,
  Button,
  ActionsDropdown,
  Badge,
  toast,
} from "@workspace/ui/components";
import { platformSubscriptionsService, type PlatformPayment } from "@/lib/services/platform-subscriptions-service";
import type { PaymentStatus, IPlatformSubscriptionPayment } from "@workspace/shared/types";
import { PAYMENT_STATUSES } from "@workspace/shared/constants";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { Trash2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface PlatformPaymentHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: number;
  subscriptionLabel: string;
  currencyFormat?: CurrencyFormat;
  onChange?: () => void;
}

const STATUS_LABELS: Record<PaymentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline"; className?: string }> = {
  pending: { label: "Pendiente", variant: "outline" },
  processing: { label: "Procesando", variant: "warning" },
  validated: { label: "Validado", variant: "success" },
  invalid: { label: "Rechazado", variant: "destructive" },
  voided: { label: "Anulado", variant: "default", className: "opacity-60" },
  refunded: { label: "Reembolsado", variant: "default", className: "opacity-60" },
};

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(cents: number, currency: string, currencyFormat: CurrencyFormat) {
  return ValueConverter.format(cents / 100, currency, currencyFormat);
}

export function PlatformPaymentHistoryModal({
  open,
  onOpenChange,
  subscriptionId,
  subscriptionLabel,
  currencyFormat = "latam",
  onChange,
}: PlatformPaymentHistoryModalProps) {
  const [payments, setPayments] = React.useState<IPlatformSubscriptionPayment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const loadPayments = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await platformSubscriptionsService.getPayments(subscriptionId);
      setPayments(data);
    } catch (error: any) {
      toast.error(error?.message || "Error al cargar pagos");
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  React.useEffect(() => {
    if (open) loadPayments();
  }, [open, loadPayments]);

  const handleChangeStatus = async (paymentId: number, status: PaymentStatus) => {
    setActionLoading(true);
    try {
      await platformSubscriptionsService.updatePaymentStatus(paymentId, status);
      toast.success(`Pago marcado como ${status}`);
      await loadPayments();
      onChange?.();
    } catch (error: any) {
      toast.error(error?.message || "Error al cambiar estado");
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<IPlatformSubscriptionPayment>[] = [
    {
      header: "Fecha",
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <Text size="sm" className="font-bold tabular-nums">
            {formatDate(p.paymentDate)}
          </Text>
          <Text size="xs" variant="muted" className="opacity-60">
            Vence: {formatDate(p.dueDate)}
          </Text>
        </div>
      ),
    },
    {
      header: "Monto",
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <Text weight="bold" size="sm" className="tabular-nums">
            {formatCurrency(p.amountPaid, p.currencyPaid, currencyFormat)}
          </Text>
          {p.exchangeRateApplied && (
            <Text size="xs" variant="muted" className="opacity-50 italic">
              TC: {p.exchangeRateApplied}
            </Text>
          )}
        </div>
      ),
    },
    {
      header: "Método",
      cell: (p) => (
        <div className="flex flex-col gap-0.5">
          <Text size="sm" className="font-medium">
            {p.paymentMethod}
          </Text>
          {p.paymentMethodDetails && typeof p.paymentMethodDetails === "object" && (
            <Text size="xs" variant="muted" className="opacity-50 italic">
              {Object.keys(p.paymentMethodDetails).length} detalles
            </Text>
          )}
        </div>
      ),
    },
    {
      header: "Estado",
      cell: (p) => {
        const config = STATUS_LABELS[p.status];
        return (
          <Badge
            variant={config.variant === "default" ? "outline" : config.variant}
            className={`text-[10px] uppercase font-bold tracking-widest ${config.className ?? ""}`}
          >
            {config.label}
          </Badge>
        );
      },
    },
    {
      header: "Acciones",
      className: "pr-4 text-right",
      headerClassName: "pr-4 text-right",
      cell: (p) => (
        <div className="flex justify-end">
          <ActionsDropdown
            modalData={p}
            sections={[
              {
                label: "Cambiar Estado",
                items: [
                  {
                    label: "Marcar como Validado",
                    icon: <CheckCircle2 size={14} />,
                    variant: "default",
                    onClick: () => handleChangeStatus(p.id, PAYMENT_STATUSES.VALIDATED),
                    show: p.status !== PAYMENT_STATUSES.VALIDATED,
                  },
                  {
                    label: "Marcar como Rechazado",
                    icon: <XCircle size={14} />,
                    variant: "destructive",
                    onClick: () => handleChangeStatus(p.id, PAYMENT_STATUSES.INVALID),
                    show: p.status !== PAYMENT_STATUSES.INVALID,
                  },
                  {
                    label: "Anular",
                    icon: <Trash2 size={14} />,
                    variant: "destructive",
                    onClick: () => handleChangeStatus(p.id, PAYMENT_STATUSES.VOIDED),
                    show: p.status !== PAYMENT_STATUSES.VOIDED,
                  },
                ],
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      trigger={null}
      title="Historial de Pagos"
      description={subscriptionLabel}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Text size="sm" variant="muted">
            {loading ? "Cargando..." : `${payments.length} pago(s) registrado(s)`}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadPayments}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refrescar
          </Button>
        </div>
        <Table
          data={payments}
          columns={columns}
          loading={loading}
          emptyState={
            <Text className="text-center py-8 text-foreground-dim">
              No hay pagos registrados para esta suscripción.
            </Text>
          }
        />
      </div>
    </Modal>
  );
}
