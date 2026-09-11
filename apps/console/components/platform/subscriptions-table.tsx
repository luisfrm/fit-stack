"use client";

import * as React from "react";
import Link from "next/link";
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
import { DeleteSubscriptionModal } from "./delete-subscription-modal";
import { PlatformPaymentModal } from "./platform-payment-modal";
import { PriceCell } from "./price-cell";
import { formatCents } from "@workspace/shared";
import {
  canManageBilling,
  hasActiveSubscription,
} from "@/lib/platform-permissions";
import { useAuth } from "@/lib/hooks/use-auth";
import { mutationError } from "@/lib/errors";
import {
  Trash2,
  Calendar,
  ExternalLink,
  CalendarPlus,
  XCircle,
  CreditCard,
  History,
} from "lucide-react";
import { type CurrencyFormat } from "@workspace/shared";

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
  settings?: Record<string, string>;
  /** Enlaza el nombre de la org a su perfil. Desactivar en la propia página de detalle. */
  linkOrganization?: boolean;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 last:border-b-0">
      <Text
        size="xs"
        variant="muted"
        className="uppercase tracking-widest font-bold shrink-0"
      >
        {label}
      </Text>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

export function SubscriptionsTable({
  subscriptions,
  loading = false,
  pagination,
  currencyFormat = "latam",
  onChange,
  settings,
  linkOrganization = true,
}: SubscriptionsTableProps) {
  const { user } = useAuth();
  const canMutateBilling = canManageBilling(user?.role);
  const [detailModal, setDetailModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [cancelModal, setCancelModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [extendModal, setExtendModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [deleteModal, setDeleteModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [paymentModal, setPaymentModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [historyModal, setHistoryModal] =
    React.useState<SubscriptionWithDetails | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const handleDelete = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      await platformSubscriptionsService.delete(deleteModal.id);
      toast.success("Suscripción eliminada");
      setDeleteModal(null);
      onChange?.();
    } catch (err) {
      toast.error(
        mutationError(
          "SubscriptionsTable",
          err,
          "No se pudo eliminar la suscripción",
        ),
      );
    } finally {
      setActionLoading(false);
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
    } catch (err) {
      toast.error(
        mutationError(
          "SubscriptionsTable",
          err,
          "No se pudo cancelar la suscripción",
        ),
      );
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
    } catch (err) {
      toast.error(
        mutationError(
          "SubscriptionsTable",
          err,
          "No se pudo extender el periodo",
        ),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<SubscriptionWithDetails>[] = [
    {
      header: "Organización",
      className: "pl-6",
      headerClassName: "pl-6",
      cell: (sub) => {
        const name = (
          <>
            <Text
              weight="bold"
              className="text-foreground hover:text-primary transition-colors leading-tight"
            >
              {sub.organizationName || sub.organizationId}
            </Text>
            {sub.organizationId && (
              <Text size="xs" variant="muted" className="opacity-50 font-mono">
                {sub.organizationId}
              </Text>
            )}
          </>
        );
        if (!linkOrganization) {
          return <div className="flex flex-col gap-0.5 text-left">{name}</div>;
        }
        return (
          <Link
            href={`/organizations/${sub.organizationSlug ?? sub.organizationId}`}
            className="flex flex-col gap-0.5 text-left hover:text-primary transition-colors"
          >
            {name}
          </Link>
        );
      },
    },
    {
      header: "Plan",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Text
              as="span"
              size="sm"
              className="uppercase font-bold tracking-widest text-primary leading-tight"
            >
              {sub.planName ?? "—"}
            </Text>
            {sub.isTrial && (
              <Badge
                variant="info"
                size="sm"
                className="uppercase font-bold tracking-widest"
              >
                Trial
              </Badge>
            )}
          </div>
          {sub.planPrice !== undefined && sub.planCurrency && (
            <Text size="xs" variant="muted" className="opacity-60 tabular-nums">
              {formatCents(sub.planPrice, sub.planCurrency, currencyFormat)}
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
      cell: (sub) => (
        <div className="flex flex-col gap-1">
          <SubscriptionStatusBadge status={sub.status} />
          {(sub.latestPaymentStatus === "pending" ||
            sub.latestPaymentStatus === "processing") && (
            <Badge
              variant="warning"
              size="sm"
              className="uppercase tracking-widest text-[9px] w-fit"
            >
              Pago pendiente
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Precio",
      cell: (sub) => (
        <div className="flex flex-col gap-0.5">
          <PriceCell
            isTrial={sub.isTrial}
            priceOverride={sub.priceOverride}
            planPrice={sub.planPrice}
            planCurrency={sub.planCurrency}
            currencyFormat={currencyFormat}
          />
          <Text size="xs" variant="muted" className="opacity-50 tabular-nums">
            {sub.paymentsCount ?? 0} pago(s)
          </Text>
        </div>
      ),
    },
    {
      header: "Acciones",
      className: "pr-6 text-right",
      headerClassName: "pr-6 text-right",
      cell: (sub) => (
        <div
          className="flex justify-end gap-1"
          data-testid={`subs-row-${sub.id}`}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDetailModal(sub)}
            className="h-8 w-8 subs-row-detail"
            title="Ver detalle"
          >
            <ExternalLink size={14} className="text-foreground/50" />
          </Button>
          <ActionsDropdown
            modalData={sub}
            className="subs-row-menu"
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
                    show: canMutateBilling && hasActiveSubscription(sub),
                    onClick: () => setPaymentModal(sub),
                  },
                  {
                    label: "Extender Periodo",
                    icon: <CalendarPlus size={14} />,
                    variant: "default",
                    show: canMutateBilling && hasActiveSubscription(sub),
                    onClick: () => setExtendModal(sub),
                  },
                  {
                    label: "Cancelar Suscripción",
                    icon: <XCircle size={14} />,
                    variant: "destructive",
                    show: canMutateBilling && hasActiveSubscription(sub),
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
                    show: canMutateBilling,
                    onClick: () => setDeleteModal(sub),
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
        emptyState={
          <Text className="text-center py-8 text-foreground-dim">
            No hay suscripciones registradas.
          </Text>
        }
        pagination={pagination}
      />
      {detailModal && (
        <Modal
          open={!!detailModal}
          onOpenChange={() => setDetailModal(null)}
          trigger={null}
          title={`Suscripción: ${detailModal.organizationName || detailModal.organizationId}`}
          className="max-w-lg subs-detail-modal"
          footer={
            <Button variant="outlined" onClick={() => setDetailModal(null)}>
              Cerrar
            </Button>
          }
        >
          <div className="flex flex-col">
            <DetailRow label="Plan">
              <div className="flex items-center justify-end gap-2">
                <Text weight="bold">{detailModal.planName ?? "—"}</Text>
                {detailModal.isTrial && (
                  <Badge
                    variant="info"
                    size="sm"
                    className="uppercase font-bold tracking-widest"
                  >
                    Trial
                  </Badge>
                )}
              </div>
            </DetailRow>
            <DetailRow label="Status">
              <SubscriptionStatusBadge status={detailModal.status} />
            </DetailRow>
            <DetailRow label="Periodo">
              <Text className="tabular-nums">
                {formatDate(detailModal.startDate)} →{" "}
                {formatDate(detailModal.currentPeriodEnd)}
              </Text>
            </DetailRow>
            <DetailRow label="Precio">
              <Text weight="bold">
                {detailModal.isTrial
                  ? "Gratuito"
                  : formatCents(
                      detailModal.priceOverride ?? detailModal.planPrice ?? 0,
                      detailModal.planCurrency ?? "USD",
                      currencyFormat,
                    )}
              </Text>
            </DetailRow>
            <DetailRow label="Pagos">
              <Text className="tabular-nums">
                {detailModal.paymentsCount ?? 0} registrado(s)
              </Text>
            </DetailRow>
            {detailModal.cancellationReason && (
              <DetailRow label="Motivo cancelación">
                <Text>{detailModal.cancellationReason}</Text>
              </DetailRow>
            )}
          </div>
        </Modal>
      )}
      <CancelSubscriptionModal
        open={!!cancelModal}
        onOpenChange={(open) => !open && setCancelModal(null)}
        onConfirm={handleCancel}
        isLoading={actionLoading}
        className="subs-cancel-modal"
      />

      <ExtendSubscriptionModal
        open={!!extendModal}
        onOpenChange={(open) => !open && setExtendModal(null)}
        currentPeriodEnd={extendModal?.currentPeriodEnd ?? new Date()}
        onConfirm={handleExtend}
        isLoading={actionLoading}
        className="subs-extend-modal"
      />

      <DeleteSubscriptionModal
        subscription={deleteModal}
        open={!!deleteModal}
        onOpenChange={(open) => !open && setDeleteModal(null)}
        onConfirm={handleDelete}
        isLoading={actionLoading}
        className="subs-delete-modal"
      />

      {paymentModal && (
        <PlatformPaymentModal
          subscription={paymentModal}
          open={!!paymentModal}
          onOpenChange={(open) => !open && setPaymentModal(null)}
          onSuccess={onChange}
          settings={settings}
        />
      )}

      {historyModal && (
        <PlatformPaymentHistoryModal
          open={!!historyModal}
          onOpenChange={() => setHistoryModal(null)}
          className="subs-history-modal"
          subscriptionId={historyModal.id}
          subscriptionLabel={`${historyModal.organizationName || historyModal.organizationId}`}
          canRegister={canMutateBilling && hasActiveSubscription(historyModal)}
          onRegisterPayment={() => {
            setHistoryModal(null);
            setPaymentModal(historyModal);
          }}
          onChange={onChange}
        />
      )}
    </>
  );
}
