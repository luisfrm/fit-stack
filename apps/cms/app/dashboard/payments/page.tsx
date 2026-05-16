"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, toast, Badge } from "@workspace/ui/components";
import { FloatingActionButton } from "@workspace/ui/components";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { KpiSection } from "@/components/payments/kpi-section";
import { RevenueChart } from "@/components/payments/revenue-chart";
import { AnalyticsCarousel } from "@/components/payments/analytics-carousel";
import { KpiSectionSkeleton, RevenueChartSkeleton } from "@/components/payments/dashboard-skeletons";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { PAYMENT_STATUSES, SUBSCRIPTION_STATUSES, SubscriptionStatus } from "@workspace/shared";
import { cn } from "@workspace/ui/lib/utils";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { CurrencyFormat } from "@/lib/utils/value-converters";
import { GLOBAL_FAB_ITEMS } from "@/lib/constants/fab-items";

import {
  useSubscriptions,
  useUpdateSubscriptionStatus,
  useDeleteSubscription,
  useUpdatePaymentStatus,
  useAnalytics
} from "@/lib/hooks/use-payments";

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = React.useState(false);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [activeFilter, setActiveFilter] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const limit = 10;

  const { data: subsResult, isLoading, isPlaceholderData, refetch } = useSubscriptions({
    page,
    limit,
    query: debouncedSearch,
    status: activeFilter || undefined
  });

  const { settings } = useSettings();
  const primaryCurrency = settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const { data: analytics, isLoading: isAnalyticsLoading, refetch: refetchAnalytics } = useAnalytics(primaryCurrency);

  const updateStatusMutation = useUpdateSubscriptionStatus();
  const deleteMutation = useDeleteSubscription();
  const updatePaymentStatusMutation = useUpdatePaymentStatus();

  // Reset page when search or filter changes
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilter]);

  const handleStatusChange = async (id: number, status: string) => {
    updateStatusMutation.mutate({ id, status: status as SubscriptionStatus }, {
      onSuccess: () => {
        toast.success(`Suscripción ${status === SUBSCRIPTION_STATUSES.ACTIVE ? 'activada' : 'revocada'}.`);
      },
      onError: (err: Error) => {
        toast.error(err.message || "Fallo al cambiar estado");
      }
    });
  };

  const handleDelete = async (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Registro eliminado.");
      },
      onError: (err: any) => {
        toast.error(err.message || "Fallo al eliminar");
      }
    });
  };

  const handlePaymentStatusChange = async (paymentId: number, status: string) => {
    updatePaymentStatusMutation.mutate({ paymentId, status }, {
      onSuccess: () => {
        toast.success("Estado de pago actualizado correctamente");
      },
      onError: (err: any) => {
        toast.error(err.message || "Error al actualizar pago");
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Suscripciones y Pagos"
        description="Controla las facturas, renovaciones y vinculaciones de usuarios a sus planes."
        iconName="CreditCard"
      >
        <SubscriptionModal
          onSuccess={() => {
            refetch();
            refetchAnalytics();
          }}
          trigger={
            (<Button size="sm" rightIcon={<Plus size={18} />}>
              NUEVO PAGO
            </Button>)
          }
        />
      </DashboardHeader>

      {/* Analytics Layer */}
      {isAnalyticsLoading ? (
        <>
          <KpiSectionSkeleton />
          <div className="flex flex-col xl:flex-row gap-4 w-full">
            <RevenueChartSkeleton />
            <RevenueChartSkeleton />
          </div>
        </>
      ) : analytics && (
        <>
          <KpiSection
            stats={analytics.kpis}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            currencyFormat={currencyFormat}
          />
          <div className="flex flex-col xl:flex-row gap-4 w-full">
            <div className="w-full xl:w-1/2">
              <RevenueChart
                data={analytics.chartData}
                baseCurrency={primaryCurrency}
                currencyFormat={currencyFormat}
              />
            </div>
            <div className="w-full xl:w-1/2">
              <AnalyticsCarousel
                data={analytics}
                currencyFormat={currencyFormat}
              />
            </div>
          </div>
        </>
      )}

      {/* Control Layer */}
      <div className="flex flex-col gap-4">
        <FilterPanel
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por usuario o nivel de plan..."
          filterOptions={[
            { value: PAYMENT_STATUSES.PROCESSING, label: "Por validar" },
            { value: SUBSCRIPTION_STATUSES.EXPIRING, label: "Por vencer" },
            { value: SUBSCRIPTION_STATUSES.ACTIVE, label: "Activas" },
            { value: PAYMENT_STATUSES.VOIDED, label: "Anuladas" },
          ]}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          filterLabel="Filtros"
        >
          <div className="flex items-center gap-2">
            {[
              { id: PAYMENT_STATUSES.PROCESSING, label: "Por validar", className: "text-orange-500 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10" },
              { id: SUBSCRIPTION_STATUSES.EXPIRING, label: "Por vencer", className: "text-destructive border-destructive/20 bg-destructive/5 hover:bg-destructive/10" },
              { id: SUBSCRIPTION_STATUSES.ACTIVE, label: "Activas", className: "text-info border-info/20 bg-info/5 hover:bg-info/10" },
              { id: PAYMENT_STATUSES.VOIDED, label: "Anuladas", className: "text-gray-500 border-gray-500/20 bg-gray-500/5 hover:bg-gray-500/10" },
            ].map((btn) => (
              <Button
                key={btn.id}
                size="sm"
                variant={activeFilter === btn.id ? "primary" : "glass"}
                className={cn(
                  "cursor-pointer font-medium transition-all normal-case tracking-normal border border-transparent",
                  activeFilter === btn.id 
                    ? "border-primary" 
                    : btn.className
                )}
                onClick={() => setActiveFilter(activeFilter === btn.id ? null : btn.id)}
              >
                {btn.label}
              </Button>
            ))}
            {activeFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setActiveFilter(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </FilterPanel>

        <section>
          <SubscriptionsTable
            subscriptions={subsResult?.data || []}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onPaymentStatusChange={handlePaymentStatusChange}
            loading={isLoading}
            pagination={{
              page,
              totalPages: subsResult?.totalPages || 1,
              total: subsResult?.total || 0,
              limit: limit,
              onPageChange: setPage
            }}
          />
        </section>

        <FloatingActionButton
          config={{
            items: [
              ...GLOBAL_FAB_ITEMS,
              {
                id: "new-payment",
                icon: Plus,
                label: "Nuevo pago",
                onClick: () => setIsNewPaymentModalOpen(true)
              }
            ]
          }}
        />

        <SubscriptionModal
          open={isNewPaymentModalOpen}
          onOpenChange={setIsNewPaymentModalOpen}
          onSuccess={() => {
            refetch();
            refetchAnalytics();
          }}
          trigger={<span />}
        />
      </div>
    </div>
  );
}
