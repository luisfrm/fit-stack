"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, toast, Badge } from "@workspace/ui/components";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { KpiSection } from "@/components/payments/kpi-section";
import { RevenueChart } from "@/components/payments/revenue-chart";
import { KpiSectionSkeleton, RevenueChartSkeleton } from "@/components/payments/dashboard-skeletons";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ORG_ROLES } from "@workspace/shared";
import { cn } from "@workspace/ui/lib/utils";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { CurrencyFormat } from "@/lib/utils/value-converters";

import {
  useSubscriptions,
  useUpdateSubscriptionStatus,
  useDeleteSubscription,
  useUpdatePaymentStatus,
  useAnalytics
} from "@/lib/hooks/use-payments";

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = React.useState("");
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

  const handleStatusChange = async (id: number, status: 'active' | 'canceled' | 'expired') => {
    updateStatusMutation.mutate({ id, status }, {
      onSuccess: () => {
        toast.success(`Suscripción ${status === 'active' ? 'activada' : 'revocada'}.`);
      },
      onError: (err: any) => {
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
          <RevenueChartSkeleton />
        </>
      ) : analytics && (
        <>
          <KpiSection
            stats={analytics.kpis}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            currencyFormat={currencyFormat}
          />
          <RevenueChart
            data={analytics.chartData}
            baseCurrency={primaryCurrency}
            currencyFormat={currencyFormat}
          />
        </>
      )}

      {/* Control Layer */}
      <div className="flex flex-col gap-4">
        <FilterPanel
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por usuario o nivel de plan..."
        >
          <div className="flex items-center gap-2">
            {[
              { id: "processing", label: "Por validar", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
              { id: "expiring", label: "Por vencer", color: "bg-red-500/10 text-red-500 border-red-500/20" },
              { id: "active", label: "Activas", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
            ].map((btn) => (
              <Badge
                key={btn.id}
                variant={btn.id === activeFilter ? "info" : "outline"}
                className={cn(
                  "cursor-pointer hover:brightness-110 hover:scale-110",
                )}
                onClick={() => setActiveFilter(activeFilter === btn.id ? null : btn.id)}
              >
                {btn.label}
              </Badge>
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
      </div>
    </div>
  );
}
