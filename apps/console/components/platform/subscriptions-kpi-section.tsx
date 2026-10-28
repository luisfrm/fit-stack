"use client";

import * as React from "react";
import { Text, Skeleton, Badge } from "@workspace/ui/components";
import {
  Users,
  AlertTriangle,
  ShieldOff,
  Wallet,
  TrendingUp,
  History,
} from "lucide-react";
import {
  formatCents,
  type CurrencyFormat,
} from "@workspace/shared";
import { selectRevenueGrowth } from "@/lib/platform/subscription-selectors";
import type { SubscriptionStats } from "@/lib/services/platform-subscriptions-service";

interface KpiSectionProps {
  stats?: SubscriptionStats;
  isLoading?: boolean;
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  /** Platform currency format (required: no invented default). */
  currencyFormat: CurrencyFormat;
  /** Platform operating currency (required: no invented "USD"). */
  currency: string;
}

function StatCard({
  label,
  value,
  icon,
  isActive,
  isLoading,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  isActive: boolean;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left transition-all rounded-2xl border p-5 hover:border-primary/30 ${
        isActive
          ? "bg-primary/10 border-primary/30"
          : "bg-white/5 border-white/5 hover:bg-white/8"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-emerald-500/10 rounded-lg">{icon}</div>
        {isActive && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
      </div>
      <Text
        size="xs"
        variant="muted"
        className="uppercase tracking-widest font-bold mb-1"
      >
        {label}
      </Text>
      {isLoading ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <Text size="lg" weight="bold" className="text-white">
          {value}
        </Text>
      )}
    </button>
  );
}

function MoneyCard({
  label,
  value,
  sub,
  icon,
  isLoading,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  isLoading?: boolean;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="text-left rounded-2xl border p-5 bg-white/5 border-white/5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
      </div>
      <Text
        size="xs"
        variant="muted"
        className="uppercase tracking-widest font-bold mb-1"
      >
        {label}
      </Text>
      {isLoading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <>
          <Text size="lg" weight="bold" className="text-white tabular-nums">
            {value}
          </Text>
          {sub && (
            <Text size="xs" variant="muted" className="opacity-60 tabular-nums">
              {sub}
            </Text>
          )}
        </>
      )}
    </div>
  );
}

export function SubscriptionsKpiSection({
  stats,
  isLoading,
  activeFilter,
  onFilterChange,
  currencyFormat,
  currency,
}: KpiSectionProps) {
  const defaultStats: SubscriptionStats = {
    active: 0,
    pastDue: 0,
    readOnly: 0,
    suspended: 0,
    cancelled: 0,
    total: 0,
    monthlyRevenueCents: 0,
    previousMonthRevenueCents: 0,
    mrrCents: 0,
    unconvertedCount: 0,
    primaryCurrency: "",
  };
  const displayStats = stats ?? defaultStats;
  const growth = selectRevenueGrowth(displayStats);
  const growthLabel =
    growth.pct === null
      ? "—"
      : `${growth.pct >= 0 ? "+" : ""}${growth.pct.toFixed(1)}% vs mes previo`;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MoneyCard
          label="Ingreso recurrente"
          value={formatCents(displayStats.mrrCents, currency, currencyFormat)}
          sub="MRR · suscripciones activas"
          icon={<Wallet className="w-4 h-4 text-primary" />}
          isLoading={isLoading}
          testId="subs-kpi-mrr"
        />
        <MoneyCard
          label="Ingreso del mes"
          value={formatCents(displayStats.monthlyRevenueCents, currency, currencyFormat)}
          sub={growthLabel}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          isLoading={isLoading}
          testId="subs-kpi-month"
        />
        <MoneyCard
          label="Mes previo"
          value={formatCents(displayStats.previousMonthRevenueCents, currency, currencyFormat)}
          icon={<History className="w-4 h-4 text-blue-400" />}
          isLoading={isLoading}
          testId="subs-kpi-prev"
        />
      </div>

      {/* Amounts are normalized to the platform primary currency by the API.
          A payment the backfill could not convert has no amount: it is excluded
          from the KPI and counted here, never assumed 1:1. */}
      {displayStats.unconvertedCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="sm" id="subs-kpi-unconverted">
            {displayStats.unconvertedCount} sin convertir
          </Badge>
          <Text size="sm" variant="muted" as="span">
            Pagos sin tasa hacia {displayStats.primaryCurrency || currency}: quedan
            fuera de los totales.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Activas"
          value={displayStats.active}
          icon={<Users className="w-4 h-4 text-emerald-400" />}
          isActive={activeFilter === "active"}
          isLoading={isLoading}
          onClick={() =>
            onFilterChange(activeFilter === "active" ? null : "active")
          }
        />

        <StatCard
          label="Vencidas"
          value={displayStats.pastDue + displayStats.readOnly}
          icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
          isActive={activeFilter === "past_due"}
          isLoading={isLoading}
          onClick={() =>
            onFilterChange(activeFilter === "past_due" ? null : "past_due")
          }
        />

        <StatCard
          label="Suspendidas"
          value={displayStats.suspended}
          icon={<ShieldOff className="w-4 h-4 text-red-400" />}
          isActive={activeFilter === "suspended"}
          isLoading={isLoading}
          onClick={() =>
            onFilterChange(activeFilter === "suspended" ? null : "suspended")
          }
        />
      </div>
    </>
  );
}
