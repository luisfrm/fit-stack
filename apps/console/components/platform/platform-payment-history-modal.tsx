"use client";

import * as React from "react";
import {
  Modal,
  Text,
  Button,
  ActionsDropdown,
  Badge,
  Skeleton,
  toast,
} from "@workspace/ui/components";
import {
  platformSubscriptionsService,
  type PlatformPayment,
} from "@/lib/services/platform-subscriptions-service";
import type {
  PaymentStatus,
  IPaymentMethodDetails,
} from "@workspace/shared/types";
import { PAYMENT_STATUSES } from "@workspace/shared/constants";
import { formatCents, type CurrencyFormat } from "@/lib/utils/value-converters";
import {
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Plus,
  ChevronDown,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { canManageBilling } from "@/lib/platform-permissions";
import { useAuth } from "@/lib/hooks/use-auth";
import { mutationError } from "@/lib/errors";
import { summarizeFeatures, type PlanFeaturesV2 } from "@workspace/shared";
import { PaymentDetailsList } from "./payment-details-list";

type PlatformPaymentWithSnapshot = PlatformPayment & {
  features_snapshot?: PlanFeaturesV2 | null;
};

interface PlatformPaymentHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: number;
  subscriptionLabel: string;
  currencyFormat?: CurrencyFormat;
  onChange?: () => void;
  canRegister?: boolean;
  onRegisterPayment?: () => void;
  className?: string;
}

const STATUS_LABELS: Record<
  PaymentStatus,
  {
    label: string;
    variant: "default" | "success" | "warning" | "destructive" | "outline";
    className?: string;
  }
> = {
  pending: { label: "Pendiente", variant: "outline" },
  processing: { label: "Procesando", variant: "warning" },
  validated: { label: "Validado", variant: "success" },
  invalid: { label: "Rechazado", variant: "destructive" },
  voided: { label: "Anulado", variant: "default", className: "opacity-60" },
  refunded: {
    label: "Reembolsado",
    variant: "default",
    className: "opacity-60",
  },
};

const STATUS_DOT: Record<PaymentStatus, string> = {
  pending: "bg-slate-400",
  processing: "bg-orange-400",
  validated: "bg-emerald-400",
  invalid: "bg-red-400",
  voided: "bg-slate-600",
  refunded: "bg-slate-500",
};

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PlatformPaymentHistoryModal({
  open,
  onOpenChange,
  subscriptionId,
  subscriptionLabel,
  currencyFormat = "latam",
  onChange,
  canRegister = false,
  onRegisterPayment,
  className,
}: Readonly<PlatformPaymentHistoryModalProps>) {
  const [payments, setPayments] = React.useState<PlatformPaymentWithSnapshot[]>(
    [],
  );
  const [loading, setLoading] = React.useState(false);
  const [actionPaymentId, setActionPaymentId] = React.useState<number | null>(null);
  const actionLoading = actionPaymentId !== null;
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const { user } = useAuth();
  const canChangeStatus = canManageBilling(user?.role);

  const loadPayments = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const data = await platformSubscriptionsService.getPayments(
          subscriptionId,
          signal ? { signal } : undefined,
        );
        setPayments(data as PlatformPaymentWithSnapshot[]);
      } catch (err) {
        if (signal?.aborted) return;
        toast.error(
          mutationError(
            "PlatformPaymentHistoryModal",
            err,
            "No se pudieron cargar los pagos",
          ),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [subscriptionId],
  );

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setExpandedId(null);
    loadPayments(controller.signal);
    return () => controller.abort();
  }, [open, loadPayments]);

  const handleChangeStatus = async (
    paymentId: number,
    status: PaymentStatus,
  ) => {
    if (actionLoading) return;
    setActionPaymentId(paymentId);
    try {
      await platformSubscriptionsService.updatePaymentStatus(paymentId, status);
      toast.success(`Pago marcado como ${status}`);
      await loadPayments();
      onChange?.();
    } catch (err) {
      toast.error(
        mutationError(
          "PlatformPaymentHistoryModal",
          err,
          "No se pudo cambiar el estado del pago",
        ),
      );
    } finally {
      setActionPaymentId(null);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!actionLoading) onOpenChange(nextOpen);
      }}
      trigger={null}
      className={className}
      title="Historial de Pagos"
      description={subscriptionLabel}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <Text size="sm" variant="muted">
            {loading
              ? "Cargando..."
              : `${payments.length} pago(s) registrado(s)`}
          </Text>
          <div className="flex items-center gap-2">
            {canRegister && onRegisterPayment && (
              <Button
                size="sm"
                onClick={onRegisterPayment}
                disabled={loading || actionLoading}
                className="gap-1.5"
              >
                <Plus size={14} />
                Registrar pago
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadPayments()}
              disabled={loading || actionLoading}
              className="gap-1.5"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refrescar
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && payments.length === 0 && (
          <Text className="text-center py-8 text-foreground-dim">
            No hay pagos registrados para esta suscripción.
          </Text>
        )}

        {!loading && (
          <div className="flex flex-col gap-2">
            {payments.map((p) => {
              const config = STATUS_LABELS[p.status];
              const expanded = expandedId === p.id;
              const snapshot = p.features_snapshot;
              const snapshotSummary = snapshot
                ? summarizeFeatures(snapshot)
                : null;
              const isRowUpdating = actionPaymentId === p.id;
              return (
                <div
                  key={p.id}
                  data-testid={`subs-payment-${p.id}`}
                  className="subs-payment-row rounded-xl border border-white/10 bg-white/5 overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        STATUS_DOT[p.status],
                      )}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <Text
                        size="sm"
                        weight="bold"
                        className="tabular-nums truncate"
                      >
                        {formatCents(
                          p.amountPaid,
                          p.currencyPaid,
                          currencyFormat,
                        )}
                      </Text>
                      <Text
                        size="xs"
                        variant="muted"
                        className="opacity-60 truncate"
                      >
                        {p.paymentMethod} · {formatDate(p.paymentDate)}
                      </Text>
                    </div>
                    <Badge
                      variant={
                        config.variant === "default"
                          ? "outline"
                          : config.variant
                      }
                      className={cn(
                        "text-[10px] uppercase font-bold tracking-widest shrink-0",
                        config.className ?? "",
                      )}
                    >
                      {config.label}
                    </Badge>
                    <button
                      type="button"
                      aria-label={expanded ? "Contraer" : "Expandir"}
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="subs-payment-toggle rounded-full p-1.5 text-foreground-dim hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                    >
                      <ChevronDown
                        size={16}
                        className={cn(
                          "transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>
                    <ActionsDropdown
                      modalData={p}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={actionLoading}
                          aria-label={isRowUpdating ? "Actualizando estado..." : "Acciones de pago"}
                        >
                          {isRowUpdating ? (
                            <Loader2 size={16} className="animate-spin text-primary" />
                          ) : (
                            <MoreHorizontal size={18} />
                          )}
                        </Button>
                      }
                      sections={[
                        {
                          label: "Cambiar Estado",
                          items: [
                            {
                              label: "Marcar como Validado",
                              icon: <CheckCircle2 size={14} />,
                              variant: "default",
                              onClick: () =>
                                handleChangeStatus(
                                  p.id,
                                  PAYMENT_STATUSES.VALIDATED,
                                ),
                              show:
                                canChangeStatus &&
                                p.status !== PAYMENT_STATUSES.VALIDATED,
                            },
                            {
                              label: "Marcar como Rechazado",
                              icon: <XCircle size={14} />,
                              variant: "destructive",
                              onClick: () =>
                                handleChangeStatus(
                                  p.id,
                                  PAYMENT_STATUSES.INVALID,
                                ),
                              show:
                                canChangeStatus &&
                                p.status !== PAYMENT_STATUSES.INVALID,
                            },
                            {
                              label: "Anular",
                              icon: <Trash2 size={14} />,
                              variant: "destructive",
                              onClick: () =>
                                handleChangeStatus(
                                  p.id,
                                  PAYMENT_STATUSES.VOIDED,
                                ),
                              show:
                                canChangeStatus &&
                                p.status !== PAYMENT_STATUSES.VOIDED,
                            },
                          ],
                        },
                      ]}
                    />
                  </div>

                  {expanded && (
                    <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Text
                          size="xs"
                          variant="muted"
                          className="uppercase tracking-widest font-bold opacity-60"
                        >
                          Detalle del método
                        </Text>
                        <PaymentDetailsList
                          details={
                            p.paymentMethodDetails as
                            | IPaymentMethodDetails
                            | Record<string, any>
                            | null
                            | undefined
                          }
                        />
                        {p.exchangeRateApplied && (
                          <Text
                            size="xs"
                            variant="muted"
                            className="opacity-50 italic tabular-nums"
                          >
                            TC: {p.exchangeRateApplied}
                          </Text>
                        )}
                      </div>
                      {snapshotSummary && (
                        <div className="flex flex-col gap-1">
                          <Text
                            size="xs"
                            variant="muted"
                            className="uppercase tracking-widest font-bold opacity-60"
                          >
                            Features al pagar
                          </Text>
                          <Text
                            size="xs"
                            className="text-foreground-muted leading-relaxed"
                          >
                            {snapshotSummary}
                          </Text>
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <Text
                          size="xs"
                          variant="muted"
                          className="opacity-60 tabular-nums"
                        >
                          Vence: {formatDate(p.dueDate)}
                        </Text>
                        {p.exchangeRateApplied == null && (
                          <Text
                            size="xs"
                            variant="muted"
                            className="opacity-60 tabular-nums"
                          >
                            Moneda: {p.currencyPaid}
                          </Text>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
