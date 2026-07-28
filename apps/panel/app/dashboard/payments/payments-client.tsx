"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, toast, FloatingActionButton } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { KpiSection } from "@/components/payments/kpi-section";
import { RevenueChart } from "@/components/payments/revenue-chart";
import { AnalyticsCarousel } from "@/components/payments/analytics-carousel";
import { KpiSectionSkeleton, RevenueChartSkeleton } from "@/components/payments/dashboard-skeletons";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { PAYMENT_STATUSES, SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@workspace/shared";
import { cn } from "@workspace/ui/lib/utils";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import type { CurrencyFormat } from "@/lib/utils/value-converters";
import { GLOBAL_FAB_ITEMS } from "@/lib/constants/fab-items";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import type { ISubscription, PaginatedSubscriptions } from "@workspace/shared/types";

interface PaymentsClientProps {
  readonly initialSubscriptions: PaginatedSubscriptions;
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialTotal: number;
  readonly initialQuery: string;
  readonly initialStatus: string | null;
  readonly initialAnalytics: Awaited<ReturnType<typeof financeService.getAnalytics>> | null;
  readonly initialMonthlyReport: Array<{
    month: string;
    currency: string;
    amount: number;
    normalizedAmount: number;
    originalExchangeRate: string;
  }>;
  readonly initialCurrencyFormat: CurrencyFormat;
  readonly initialPrimaryCurrency: string;
  readonly limit: number;
}

export function PaymentsClient({
  initialSubscriptions,
  initialPage,
  initialTotalPages,
  initialTotal,
  initialQuery,
  initialStatus,
  initialAnalytics,
  initialMonthlyReport,
  initialCurrencyFormat,
  initialPrimaryCurrency,
  limit,
}: PaymentsClientProps) {
  const router = useRouter();
  const { settings } = useSettings();
  const primaryCurrency =
    settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || initialPrimaryCurrency;
  const currencyFormat =
    (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) ||
    initialCurrencyFormat;

  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const [activeFilter, setActiveFilter] = React.useState<string | null>(initialStatus);
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = React.useState(false);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [analytics, setAnalytics] = React.useState(initialAnalytics);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeFilter) params.set("status", activeFilter);
    params.set("page", "1");
    router.push(`/dashboard/payments?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router, activeFilter]);

  const setFilterAndNavigate = (filter: string | null) => {
    setActiveFilter(filter);
    const params = new URLSearchParams();
    if (initialQuery) params.set("search", initialQuery);
    if (filter) params.set("status", filter);
    params.set("page", "1");
    router.push(`/dashboard/payments?${params.toString()}`);
  };

  const navigatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("search", initialQuery);
    if (activeFilter) params.set("status", activeFilter);
    params.set("page", String(newPage));
    router.push(`/dashboard/payments?${params.toString()}`);
  };

  const refreshAll = React.useCallback(async () => {
    router.refresh();
    if (primaryCurrency) {
      setAnalyticsLoading(true);
      try {
        const fresh = await financeService.getAnalytics(primaryCurrency);
        setAnalytics(fresh);
      } catch {
        // ignore analytics refresh errors
      } finally {
        setAnalyticsLoading(false);
      }
    }
  }, [router, primaryCurrency]);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await subscriptionsService.updateStatus(id, status as SubscriptionStatus);
      toast.success(
        `Suscripción ${status === SUBSCRIPTION_STATUSES.ACTIVE ? "activada" : "revocada"}.`,
      );
      refreshAll();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Fallo al cambiar estado";
      toast.error(message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await subscriptionsService.delete(id);
      toast.success("Registro eliminado.");
      refreshAll();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Fallo al eliminar";
      toast.error(message);
    }
  };

  const handlePaymentStatusChange = async (paymentId: number, status: string) => {
    try {
      await financeService.updatePaymentStatus(paymentId, status);
      toast.success("Estado de pago actualizado correctamente");
      refreshAll();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Error al actualizar pago";
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Suscripciones y Pagos"
        description="Controla las facturas, renovaciones y vinculaciones de usuarios a sus planes."
        iconName="CreditCard"
      >
        <SubscriptionModal
          onSuccess={refreshAll}
          trigger={
            <Button size="sm" rightIcon={<Plus size={18} />}>
              NUEVO PAGO
            </Button>
          }
        />
      </DashboardHeader>

      {/* Analytics Layer */}
      {analyticsLoading && !analytics ? (
        <>
          <KpiSectionSkeleton />
          <div className="flex flex-col xl:flex-row gap-4 w-full">
            <RevenueChartSkeleton />
            <RevenueChartSkeleton />
          </div>
        </>
      ) : analytics ? (
        <>
          <KpiSection
            stats={analytics.kpis}
            activeFilter={activeFilter}
            onFilterChange={setFilterAndNavigate}
            currencyFormat={currencyFormat}
          />
          <div className="flex flex-col xl:flex-row gap-4 w-full">
            <div className="w-full xl:w-1/2">
              <RevenueChart
                data={analytics.chartData}
                monthlyData={initialMonthlyReport}
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
      ) : null}

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
          onFilterChange={setFilterAndNavigate}
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
                onClick={() => setFilterAndNavigate(activeFilter === btn.id ? null : btn.id)}
              >
                {btn.label}
              </Button>
            ))}
            {activeFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setFilterAndNavigate(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </FilterPanel>

        <section>
          <SubscriptionsTable
            subscriptions={initialSubscriptions.data as ISubscription[]}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onPaymentStatusChange={handlePaymentStatusChange}
            loading={false}
            pagination={{
              page: initialPage,
              totalPages: initialTotalPages,
              total: initialTotal,
              limit,
              onPageChange: navigatePage,
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
                onClick: () => setIsNewPaymentModalOpen(true),
              },
            ],
          }}
        />

        <SubscriptionModal
          open={isNewPaymentModalOpen}
          onOpenChange={setIsNewPaymentModalOpen}
          onSuccess={refreshAll}
          trigger={<span />}
        />
      </div>
    </div>
  );
}
