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
} from "@workspace/ui/components";
import { platformSubscriptionsService, type SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import {
  Trash2,
  Calendar,
  XCircle,
  ExternalLink,
  CalendarPlus,
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
  onStatusChange?: (id: number, status: string) => void;
  onDelete?: (id: number) => void;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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
}: SubscriptionsTableProps) {
  const router = useRouter();
  const [detailModal, setDetailModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [cancelModal, setCancelModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [extendModal, setExtendModal] = React.useState<SubscriptionWithDetails | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [extendDate, setExtendDate] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta suscripción?")) return;
    try {
      await platformSubscriptionsService.delete(id);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.cancel(cancelModal.id, cancelReason || undefined);
      setCancelModal(null);
      setCancelReason("");
    } catch (error) {
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!extendModal || !extendDate) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.extend(extendModal.id, extendDate);
      setExtendModal(null);
      setExtendDate("");
    } catch (error) {
      console.error(error);
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
          onClick={() => router.push(`/dashboard/organizations/${sub.organizationId}/subscriptions`)}
          className="flex flex-col gap-0.5 text-left hover:text-primary transition-colors"
        >
          <Text weight="bold" className="text-foreground hover:text-primary transition-colors leading-tight">
            {sub.organizationName}
          </Text>
          {sub.organizationSlug && (
            <Text size="xs" variant="muted" className="opacity-50 font-mono">
              /{sub.organizationSlug}
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
              {sub.planName}
            </Text>
            {sub.isTrial && (
              <Badge variant="default" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 uppercase font-bold tracking-widest px-1.5 h-4">
                Trial
              </Badge>
            )}
          </div>
          <Text size="xs" variant="muted" className="opacity-60">
            {formatCurrency(Number(sub.planPrice), sub.planCurrency, currencyFormat)}
          </Text>
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
      cell: (sub) => <SubscriptionStatusBadge status={sub.computedStatus} />,
    },
    {
      header: "Precio",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          {sub.isTrial ? (
            <Text weight="bold" size="sm" className="text-blue-400">Gratuito</Text>
          ) : sub.priceOverride ? (
            <div className="flex flex-col gap-0.5">
              <Text weight="bold" size="sm" className="text-primary">
                {formatCurrency(Number(sub.priceOverride), sub.planCurrency, currencyFormat)}
              </Text>
              {Number(sub.priceOverride) !== Number(sub.planPrice) && (
                <Text size="xs" variant="muted" className="opacity-50 italic" title={`Precio base: ${formatCurrency(Number(sub.planPrice), sub.planCurrency, currencyFormat)}`}>
                  Base: {formatCurrency(Number(sub.planPrice), sub.planCurrency, currencyFormat)}
                </Text>
              )}
            </div>
          ) : (
            <Text weight="bold" size="sm">
              {formatCurrency(Number(sub.planPrice), sub.planCurrency, currencyFormat)}
            </Text>
          )}
        </div>
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
                    label: "Extender Periodo",
                    icon: <CalendarPlus size={14} />,
                    variant: "default",
                    onClick: () => {
                      const newDate = new Date(sub.currentPeriodEnd);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setExtendDate(newDate.toISOString().split('T')[0] ?? '');
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
          title={`Suscripción: ${detailModal.organizationName}`}
          className="max-w-lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Plan</Text>
                <Text weight="bold">{detailModal.planName}</Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Status</Text>
                <SubscriptionStatusBadge status={detailModal.computedStatus} />
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
                        Number(detailModal.priceOverride || detailModal.planPrice),
                        detailModal.planCurrency,
                        currencyFormat
                      )}
                </Text>
              </div>
              <div className="space-y-1">
                <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Trial</Text>
                <Text>{detailModal.isTrial ? "Sí" : "No"}</Text>
              </div>
              {detailModal.cancellationReason && (
                <div className="col-span-2 space-y-1 p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                  <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold text-red-400">Razón de Cancelación</Text>
                  <Text>{detailModal.cancellationReason}</Text>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setDetailModal(null)}>Cerrar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDetailModal(null);
                  setCancelModal(detailModal);
                }}
              >
                Cancelar Suscripción
              </Button>
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
          className="max-w-md"
        >
          <div className="space-y-6">
            <Text variant="muted">
              ¿Estás seguro de cancelar la suscripción de <strong>{cancelModal.organizationName}</strong> al plan <strong>{cancelModal.planName}</strong>?
            </Text>

            <div className="space-y-2">
              <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Razón (opcional)</Text>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej: Cliente solicitó cancelación..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setCancelModal(null)}>Cerrar</Button>
              <Button
                variant="danger"
                onClick={handleCancel}
                loading={actionLoading}
              >
                Confirmar Cancelación
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
          className="max-w-md"
        >
          <div className="space-y-6">
            <Text variant="muted">
              Extender la suscripción de <strong>{extendModal.organizationName}</strong> hasta:
            </Text>

            <div className="space-y-2">
              <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold">Nueva Fecha de Fin</Text>
              <Input
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setExtendModal(null)}>Cerrar</Button>
              <Button
                variant="primary"
                onClick={handleExtend}
                loading={actionLoading}
                disabled={!extendDate}
              >
                Extender Suscripción
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}