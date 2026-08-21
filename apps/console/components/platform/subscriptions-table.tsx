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
  Input,
  toast,
} from "@workspace/ui/components";
import {
  platformSubscriptionsService,
  type SubscriptionWithDetails,
} from "@/lib/services/platform-subscriptions-service";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import { PlatformPaymentHistoryModal } from "./platform-payment-history-modal";
import {
  Trash2,
  Calendar,
  XCircle,
  ExternalLink,
  CalendarPlus,
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
  const [cancelReason, setCancelReason] = React.useState("");
  const [extendDate, setExtendDate] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta suscripción?")) return;
    try {
      await platformSubscriptionsService.delete(id);
      toast.success("Suscripción eliminada");
      onChange?.();
    } catch (error: any) {
      toast.error(error?.message || "Error al eliminar");
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.cancel(cancelModal.id, cancelReason || undefined);
      toast.success("Suscripción cancelada");
      setCancelModal(null);
      setCancelReason("");
      onChange?.();
    } catch (error: any) {
      toast.error(error?.message || "Error al cancelar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!extendModal || !extendDate) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.extend(extendModal.id, extendDate);
      toast.success("Periodo extendido");
      setExtendModal(null);
      setExtendDate("");
      onChange?.();
    } catch (error: any) {
      toast.error(error?.message || "Error al extender");
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
              <Badge variant="default" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 uppercase font-bold tracking-widest px-1.5 h-4">
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
      cell: (sub) => {
        if (sub.isTrial) {
          return <Text weight="bold" size="sm" className="text-blue-400">Gratuito</Text>;
        }
        if (sub.priceOverride !== null && sub.priceOverride !== undefined) {
          return (
            <div className="flex flex-col gap-0.5">
              <Text weight="bold" size="sm" className="text-primary">
                {formatCurrency(
                  sub.priceOverride / 100,
                  sub.planCurrency ?? "USD",
                  currencyFormat
                )}
              </Text>
              {sub.planPrice !== undefined &&
                sub.priceOverride !== sub.planPrice && (
                  <Text
                    size="xs"
                    variant="muted"
                    className="opacity-50 italic"
                    title={`Precio base: ${formatCurrency(
                      sub.planPrice / 100,
                      sub.planCurrency ?? "USD",
                      currencyFormat
                    )}`}
                  >
                    Base: {formatCurrency(sub.planPrice / 100, sub.planCurrency ?? "USD", currencyFormat)}
                  </Text>
                )}
            </div>
          );
        }
        return (
          <Text weight="bold" size="sm">
            {sub.planPrice !== undefined
              ? formatCurrency(sub.planPrice / 100, sub.planCurrency ?? "USD", currencyFormat)
              : "—"}
          </Text>
        );
      },
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
                    onClick: () => {
                      const newDate = new Date(sub.currentPeriodEnd);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setExtendDate(newDate.toISOString().split("T")[0] ?? "");
                      setExtendModal(sub);
                    },
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

      {/* Detail Modal */}
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

      {/* Cancel Modal */}
      {cancelModal && (
        <Modal
          open={!!cancelModal}
          onOpenChange={() => setCancelModal(null)}
          trigger={null}
          title="Cancelar Suscripción"
          description="Esta acción no se puede deshacer."
        >
          <div className="space-y-4">
            <Input
              label="Motivo (opcional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: Cliente solicitó baja"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outlined" onClick={() => setCancelModal(null)} disabled={actionLoading}>
                Volver
              </Button>
              <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                {actionLoading ? "Cancelando..." : "Confirmar Cancelación"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Extend Modal */}
      {extendModal && (
        <Modal
          open={!!extendModal}
          onOpenChange={() => setExtendModal(null)}
          trigger={null}
          title="Extender Periodo"
          description={`Vence actualmente: ${formatDate(extendModal.currentPeriodEnd)}`}
        >
          <div className="space-y-4">
            <Input
              type="date"
              label="Nueva fecha de vencimiento"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outlined" onClick={() => setExtendModal(null)} disabled={actionLoading}>
                Volver
              </Button>
              <Button onClick={handleExtend} disabled={actionLoading || !extendDate}>
                {actionLoading ? "Extendiendo..." : "Confirmar Extensión"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment History Modal */}
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
