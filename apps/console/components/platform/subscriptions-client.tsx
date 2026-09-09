"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button, Text, SimpleSelect } from "@workspace/ui/components";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@workspace/ui/lib/utils";
import type { CurrencyFormat } from "@/lib/utils/value-converters";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";
import type { IPlatformPlan } from "@workspace/shared/types";

interface SubscriptionsClientProps {
  readonly initialSubscriptions: SubscriptionWithDetails[];
  readonly initialTotal: number;
  readonly initialTotalPages: number;
  readonly page: number;
  readonly limit: number;
  readonly currencyFormat: CurrencyFormat;
  readonly initialQuery: string;
  readonly initialStatus: string | null;
  readonly initialPlanId?: number | null;
  readonly plans?: IPlatformPlan[];
  readonly settings?: Record<string, string>;
  readonly onRefresh?: () => Promise<void>;
}

const FILTER_OPTIONS = [
  {
    id: "active",
    label: "Activas",
    className: "text-emerald-500 border-emerald-500/20 bg-emerald-500/5",
  },
  {
    id: "trial",
    label: "Trial",
    className: "text-blue-500 border-blue-500/20 bg-blue-500/5",
  },
  {
    id: "expiring",
    label: "Por Vencer",
    className: "text-orange-500 border-orange-500/20 bg-orange-500/5",
  },
  {
    id: "suspended",
    label: "Suspendidas",
    className: "text-red-500 border-red-500/20 bg-red-500/5",
  },
] as const;

export function SubscriptionsClient({
  initialSubscriptions,
  initialTotal,
  initialTotalPages,
  page,
  limit,
  currencyFormat,
  initialQuery,
  initialStatus,
  initialPlanId = null,
  plans = [],
  settings,
  onRefresh,
}: SubscriptionsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [activeFilter, setActiveFilter] = React.useState<string | null>(
    initialStatus,
  );

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    const currentSearch = params.get("search") || "";
    if (debouncedSearch !== currentSearch) {
      if (debouncedSearch) params.set("search", debouncedSearch);
      else params.delete("search");
      params.set("page", "1");
      changed = true;
    }

    if (changed) {
      router.push(`/subscriptions?${params.toString()}`);
    }
  }, [debouncedSearch, router, searchParams]);

  const setStatusFilter = (newStatus: string | null) => {
    setActiveFilter(newStatus);
    const params = new URLSearchParams(searchParams.toString());
    if (newStatus) params.set("status", newStatus);
    else params.delete("status");
    params.set("page", "1");
    router.push(`/subscriptions?${params.toString()}`);
  };

  const setPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/subscriptions?${params.toString()}`);
  };

  const setPlanFilter = (planId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (planId) params.set("planId", planId.toString());
    else params.delete("planId");
    params.set("page", "1");
    router.push(`/subscriptions?${params.toString()}`);
  };

  const handleChanged = async () => {
    await onRefresh?.();
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-dim"
            />
            <input
              type="text"
              data-testid="subs-search"
              placeholder="Buscar por organización o plan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-10 pr-4 w-full bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-foreground-dim focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            {FILTER_OPTIONS.map((btn) => (
              <Button
                key={btn.id}
                size="sm"
                variant={activeFilter === btn.id ? "primary" : "glass"}
                className={cn(
                  "cursor-pointer font-medium transition-all normal-case tracking-normal",
                  activeFilter === btn.id ? "border-primary" : btn.className,
                )}
                onClick={() =>
                  setStatusFilter(activeFilter === btn.id ? null : btn.id)
                }
              >
                {btn.label}
              </Button>
            ))}
            {activeFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setStatusFilter(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {plans.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-48">
                <SimpleSelect
                  className="subs-plan-filter"
                  value={initialPlanId ? initialPlanId.toString() : ""}
                  onChange={(value) =>
                    setPlanFilter(value ? Number(value) : null)
                  }
                  options={plans.map((plan) => ({
                    value: plan.id.toString(),
                    label: plan.name,
                  }))}
                  placeholder="Todos los planes"
                />
              </div>
              {initialPlanId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full shrink-0"
                  onClick={() => setPlanFilter(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div data-testid="subs-table">
        <SubscriptionsTable
          subscriptions={initialSubscriptions}
          currencyFormat={currencyFormat}
          settings={settings}
          pagination={{
            page,
            totalPages: initialTotalPages,
            total: initialTotal,
            limit,
            onPageChange: setPage,
          }}
          onChange={handleChanged}
        />
      </div>
    </div>
  );
}
