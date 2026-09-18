"use client";

import * as React from "react";
import { TrendingUp, Clock, AlertTriangle, Users, Wallet, Receipt } from "lucide-react";
import { ValueConverter, formatCents, type CurrencyFormat } from "@workspace/shared";
import { KpiCard } from "./kpi-card";

interface CurrencyBreakdown {
  id?: string | number;
  currency: string;
  amount: number;
}

interface KpiSectionProps {
  stats: {
    todayRevenue: CurrencyBreakdown[];
    pendingPayments: number;
    expiringSoon: number;
    activeSubscriptions: number;
  };
  onFilterChange: (filter: string | null) => void;
  activeFilter: string | null;
  currencyFormat: CurrencyFormat;
  /** Cobrado del mes en centavos normalizados (P2, opcional). */
  monthCollectedCents?: number | null;
  /** Cobro por suscripción activa en centavos (P2, opcional). */
  perSubscriptionCents?: number | null;
  primaryCurrency?: string;
}

export function KpiSection({
  stats,
  onFilterChange,
  activeFilter,
  currencyFormat = "latam",
  monthCollectedCents,
  perSubscriptionCents,
  primaryCurrency = "",
}: Readonly<KpiSectionProps>) {

  // Format currency list for the ticker using ValueConverter
  const tickerLabel = React.useMemo(() => {
    if (stats.todayRevenue.length === 0) {
      return ValueConverter.format(0, "---", currencyFormat);
    }

    return stats.todayRevenue
      .map(r => formatCents(r.amount, r.currency, currencyFormat))
      .join(" • ");
  }, [stats.todayRevenue, currencyFormat]);

  const cards = [
    {
      title: "Recaudado Hoy",
      value: tickerLabel,
      description: "Desglose por divisas reales",
      icon: TrendingUp,
      className: "text-primary",
      filterId: undefined,
      isTicker: true,
      tooltipContent: stats.todayRevenue.length > 0 ? (
        <div className="flex flex-col gap-1 p-1">
          <p className="font-bold border-b border-white/10 pb-1 mb-1">Cortes del día</p>
          {stats.todayRevenue.map((r, idx) => (
            <div key={`${r.currency}-${r.id ?? idx}`} className="flex justify-between gap-4 text-xs">
              <span className="opacity-70">{r.currency}</span>
              <span className="font-mono">{formatCents(r.amount, "", currencyFormat)}</span>
            </div>
          ))}
        </div>
      ) : undefined
    },
    {
      title: "Suscripciones Activas",
      value: stats.activeSubscriptions.toString(),
      description: "Miembros con plan vigente",
      icon: Users,
      className: "text-blue-500",
      filterId: "active",
    },
    {
      title: "Pagos por Validar",
      value: stats.pendingPayments.toString(),
      description: "Revisión manual pendiente",
      icon: Clock,
      className: "text-orange-500",
      filterId: "processing",
    },
    {
      title: "Próximos Vencimientos",
      value: stats.expiringSoon.toString(),
      description: "Vencen en menos de 7 días",
      icon: AlertTriangle,
      className: "text-red-500",
      filterId: "expiring",
    },
    ...(monthCollectedCents !== undefined && monthCollectedCents !== null
      ? [
          {
            title: "Cobrado del Mes",
            value: formatCents(monthCollectedCents, primaryCurrency, currencyFormat),
            description: "Último mes normalizado",
            icon: Wallet,
            className: "text-emerald-500",
            filterId: undefined,
          },
        ]
      : []),
    ...(perSubscriptionCents !== undefined && perSubscriptionCents !== null
      ? [
          {
            title: "Cobro por Suscripción",
            value: formatCents(perSubscriptionCents, primaryCurrency, currencyFormat),
            description: "Promedio por plan activo",
            icon: Receipt,
            className: "text-violet-500",
            filterId: undefined,
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <KpiCard
          key={card.title}
          title={card.title}
          value={card.value}
          description={card.description}
          icon={card.icon}
          iconClassName={card.className}
          filterId={card.filterId}
          isActive={activeFilter === card.filterId}
          isTicker={card.isTicker}
          onFilterChange={onFilterChange}
          tooltipContent={card.tooltipContent}
        />
      ))}
    </div>
  );
}
