"use client";

import * as React from "react";
import { TrendingUp, Clock, AlertTriangle, Users } from "lucide-react";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { KpiCard } from "./kpi-card";

interface CurrencyBreakdown {
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
}

export function KpiSection({ 
  stats, 
  onFilterChange, 
  activeFilter, 
  currencyFormat = "latam" 
}: Readonly<KpiSectionProps>) {
  
  // Format currency list for the ticker using ValueConverter
  const tickerLabel = React.useMemo(() => {
    if (stats.todayRevenue.length === 0) {
      return ValueConverter.format(0, "---", currencyFormat);
    }
    
    return stats.todayRevenue
      .map(r => ValueConverter.format(r.amount / 100, r.currency, currencyFormat))
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
          {stats.todayRevenue.map(r => (
            <div key={r.currency} className="flex justify-between gap-4 text-xs">
              <span className="opacity-70">{r.currency}</span>
              <span className="font-mono">{ValueConverter.format(r.amount / 100, "", currencyFormat)}</span>
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
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
