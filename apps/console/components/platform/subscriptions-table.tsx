"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  type ColumnDef,
  Text,
  Button,
  ActionsDropdown,
  Badge,
  Modal,
  toast,
} from "@workspace/ui/components";
import {
  platformSubscriptionsService,
  type SubscriptionWithDetails,
} from "@/lib/services/platform-subscriptions-service";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import { PlatformPaymentHistoryModal } from "./platform-payment-history-modal";
import { CancelSubscriptionModal } from "./cancel-subscription-modal";
import { ExtendSubscriptionModal } from "./extend-subscription-modal";
import { PriceCell } from "./price-cell";
import {
  Trash2,
  Calendar,
  ExternalLink,
  CalendarPlus,
  XCircle,
  CreditCard,
  History,
} from "lucide-react";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";

interface SubscriptionsTableProps {
  subscriptions: SubscriptionWithDetails[];
  loading?: boolean;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  currencyFormat?: CurrencyFormat;
  onChange?: () => void;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency: string, currencyFormat: CurrencyFormat) {
  return ValueConverter.format(amount, currency, currencyFormat);
}

export function SubscriptionsTable({
  subscriptions,
  loading = false,
  pagination,
  currencyFormat = "latam",
  onChange,
}: SubscriptionsTableProps) {
  const router = useRouter();
  const [detailModal, setDetailModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [cancelModal, setCancelModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [extendModal, setExtendModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [historyModal, setHistoryModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta suscripción?")) return;
    try {
      await platformSubscriptionsService.delete(id);
      toast.success("Suscripción eliminada");
      onChange?.();
    } catch (error: any) {
      console.error("Error deleting subscription:", error);
      toast.error("Error al eliminar");
    }
  };

  const handleCancel = async (reason: string | undefined) => {
    if (!cancelModal) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.cancel(cancelModal.id, reason);
      toast.success("Suscripción cancelada");
      setCancelModal(null);
      onChange?.();
    } catch (error: any) {
      console.error("Error cancelling subscription:", error);
      toast.error("Error al cancelar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async (newDate: string) => {
    if (!extendModal) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.extend(extendModal.id, newDate);
      toast.success("Periodo extendido");
      setExtendModal(null);
      onChange?.();
    } catch (error: any) {
      console.error("Error extending subscription:", error);
      toast.error("Error al extender");
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<SubscriptionWithDetails>[] = [
    {
      header: "Organización",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (sub) => (
        <button
          onClick={() => router.push(`/organizations/${sub.organizationId}/subscriptions`)}
          className="flex flex-col gap-0.5 text-left hover:text-primary transition-colors"
        >
          <Text weight="bold" className="text-foreground hover:text-primary transition-colors leading-tight">
            {sub.organizationName || sub.organizationId}
          </Text>
          {sub.organizationId && (
            <Text size="xs" variant="muted" className="opacity-50 font-mono">
              {sub.organizationId}
            </Text>
          )}
        </button>
      ),
    },
    {
      header: "Plan",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Text as="span" size="sm" className="uppercase font-bold tracking-widest text-primary leading-tight">
              {sub.planName ?? "—"}
            </Text>
            {sub.isTrial && (
              <Badge variant="info" size="sm" className="uppercase font-bold tracking-widest">
                Trial
              </Badge>
            )}
          </div>
          {sub.planPrice !== undefined && sub.planCurrency && (
            <Text size="xs" variant="muted" className="opacity-60">
              {formatCurrency(sub.planPrice, sub.planCurrency, currencyFormat)}
            </Text>
          )}
        </div>
      ),
    },
    {
      header: "Periodo",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-primary opacity-70" />
            <Text size="sm" className="font-bold tabular-nums">
              {formatDate(sub.currentPeriodEnd)}
            </Text>
          </div>
          <Text size="xs" variant="muted" className="opacity-40 italic">
            Desde: {formatDate(sub.startDate)}
          </Text>
        </div>
      ),
    },
    {
      header: "Status",
      cell: (sub) => <SubscriptionStatusBadge status={sub.status} />,
    },
    {
      header: "Precio",
      cell: (sub) => (
        <PriceCell
          isTrial={sub.isTrial}
          priceOverride={sub.priceOverride}
          planPrice={sub.planPrice}
          planCurrency={sub.planCurrency}
          currencyFormat={currencyFormat}
        />
      ),
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (sub) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDetailModal(sub)}
            className="h-8 w-8"
            title="Ver detalle"
          >
            <ExternalLink size={14} className="text-foreground/50" />
          </Button>
          <ActionsDropdown
            modalData={sub}
            sections={[
              {
                label: "Gestión de Suscripción",
                items: [
                  {
                    label: "Ver Pagos",
                    icon: <History size={14} />,
                    variant: "default",
                    onClick: () => setHistoryModal(sub),
                  },
                  {
                    label: "Registrar Pago",
                    icon: <CreditCard size={14} />,
                    variant: "default",
                    onClick: () => router.push(`/organizations/${sub.organizationId}/subscriptions?addPayment=${sub.id}`),
                  },
                  {
                    label: "Extender Periodo",
                    icon: <CalendarPlus size={14} />,
                    variant: "default",
                    onClick: () => setExtendModal(sub),
                  },
                  {
                    label: "Cancelar Suscripción",
                    icon: <XCircle size={14} />,
                    variant: "destructive",
                    onClick: () => setCancelModal(sub),
                  },
                ],
              },
              {
                label: "Danger Zone",
                items: [
                  {
                    label: "Eliminar Registro",
                    icon: <Trash2 size={14} />,
                    variant: "destructive",
                    onClick: () => handleDelete(sub.id),
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
    <>
      <Table
        data={subscriptions}
        columns={columns}
        loading={loading}
        emptyState={<Text className="text-center py-8 text-foreground-dim">No hay suscripciones registradas.</Text>}
        pagination={pagination}
      />

      {detailModal && (
        <Modal
          open={!!detailModal}
          onOpenChange={() => setDetailModal(null)}
          trigger={null}
          title={`Suscripción: ${detailModal.organizationName || detailModal.organizationId}`}
          className="max-w-lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Plan</Text>
                <Text weight="bold">{detailModal.planName ?? "—"}</Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Status</Text>
                <SubscriptionStatusBadge status={detailModal.status} />
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Inicio</Text>
                <Text>{formatDate(detailModal.startDate)}</Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Fin</Text>
                <Text>{formatDate(detailModal.currentPeriodEnd)}</Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Precio</Text>
                <Text weight="bold">
                  {detailModal.isTrial
                    ? "Gratuito"
                    : formatCurrency(
                        (detailModal.priceOverride ?? detailModal.planPrice ?? 0) / 100,
                        detailModal.planCurrency ?? "USD",
                        currencyFormat
                      )}
                </Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Trial</Text>
                <Text>{detailModal.isTrial ? "Sí" : "No"}</Text>
              </div>
              {detailModal.cancellationReason && (
                <div className="space-y-1 col-span-2">
                  <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Motivo cancelación</Text>
                  <Text>{detailModal.cancellationReason}</Text>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outlined" onClick={() => setDetailModal(null)}>Cerrar</Button>
            </div>
          </div>
        </Modal>
      )}

      <CancelSubscriptionModal
        open={!!cancelModal}
        onOpenChange={(open) => !open && setCancelModal(null)}
        onConfirm={handleCancel}
        isLoading={actionLoading}
      />

      <ExtendSubscriptionModal
        open={!!extendModal}
        onOpenChange={(open) => !open && setExtendModal(null)}
        currentPeriodEnd={extendModal?.currentPeriodEnd ?? new Date()}
        onConfirm={handleExtend}
        isLoading={actionLoading}
      />

      {historyModal && (
        <PlatformPaymentHistoryModal
          open={!!historyModal}
          onOpenChange={() => setHistoryModal(null)}
          subscriptionId={historyModal.id}
          subscriptionLabel={`${historyModal.organizationName || historyModal.organizationId} - ${historyModal.planName ?? ""}`}
          onChange={onChange}
        />
      )}
    </>
  );
}
