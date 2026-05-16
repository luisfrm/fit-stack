"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SubscriptionsKpiSection } from "@/components/platform/subscriptions-kpi-section";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";
import { usePlatformSubscriptionStats, useCancelSubscription, useExtendSubscription, useDeleteSubscription } from "@/lib/hooks/use-platform-subscriptions";
import { PlatformSubscriptionStatus } from "@workspace/shared/types";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { X, Plus } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { type CurrencyFormat } from "@/lib/utils/value-converters";
import { toast } from "@workspace/ui/components";

export default function PlatformSubscriptionsPage() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const limit = 15;

  const debouncedSearch = useDebounce(searchTerm, 500);
  const { settings } = usePlatformSettings();
  const currencyFormat = (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const { data: subsResult, isLoading, refetch } = useQuery({
    queryKey: ["platform-subscriptions", { page, status: activeFilter, search: debouncedSearch }],
    queryFn: () => platformSubscriptionsService.getAll({
      page,
      limit,
      status: activeFilter as PlatformSubscriptionStatus | undefined,
      search: debouncedSearch,
    }),
  });

  const { stats, isLoading: isStatsLoading } = usePlatformSubscriptionStats();
  const cancelMutation = useCancelSubscription();
  const extendMutation = useExtendSubscription();
  const deleteMutation = useDeleteSubscription();

  const handleCancel = async (id: number, reason?: string) => {
    try {
      await cancelMutation.mutateAsync({ id, reason });
      toast.success("Suscripción cancelada correctamente");
    } catch (error) {
      toast.error("Error al cancelar la suscripción");
    }
  };

  const handleExtend = async (id: number, newEndDate: string) => {
    try {
      await extendMutation.mutateAsync({ id, newEndDate });
      toast.success("Período extendido correctamente");
    } catch (error) {
      toast.error("Error al extender el período");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Suscripción eliminada correctamente");
    } catch (error) {
      toast.error("Error al eliminar la suscripción");
    }
  };

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilter]);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Suscripciones SaaS"
        description="Gestiona las suscripciones de todas las organizaciones al plataforma Fit-Stack."
        iconName="CalendarCheck"
      />

      <SubscriptionsKpiSection
        stats={stats}
        isLoading={isStatsLoading}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              placeholder="Buscar por organización o plan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-foreground-dim w-full max-w-md focus:outline-none focus:border-primary/40 transition-colors"
            />

            <div className="flex items-center gap-2">
              {[
                { id: 'active', label: 'Activas', className: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' },
                { id: 'trial', label: 'Trial', className: 'text-blue-500 border-blue-500/20 bg-blue-500/5' },
                { id: 'expiring', label: 'Por Vencer', className: 'text-orange-500 border-orange-500/20 bg-orange-500/5' },
                { id: 'suspended', label: 'Suspendidas', className: 'text-red-500 border-red-500/20 bg-red-500/5' },
              ].map((btn) => (
                <Button
                  key={btn.id}
                  size="sm"
                  variant={activeFilter === btn.id ? "primary" : "glass"}
                  className={cn(
                    "cursor-pointer font-medium transition-all normal-case tracking-normal",
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
          </div>
        </div>

        <SubscriptionsTable
          subscriptions={subsResult?.data || []}
          loading={isLoading}
          currencyFormat={currencyFormat}
          pagination={{
            page,
            totalPages: subsResult?.totalPages || 1,
            total: subsResult?.total || 0,
            limit,
            onPageChange: setPage,
          }}
        />
      </div>
    </div>
  );
}