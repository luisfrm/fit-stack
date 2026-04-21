"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, SimpleTooltip } from "@workspace/ui/components";
import { TrendingUp, Clock, AlertTriangle, Users } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";

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
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeFilter === card.filterId;

        const content = (
          <Card
            key={card.title}
            className={cn(
              "cursor-pointer transition-all hover:border-white/20 hover:bg-white/8 select-none",
              isActive && "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
              card.filterId === undefined && "cursor-default hover:bg-white/5"
            )}
            onClick={() => card.filterId !== undefined && onFilterChange(isActive ? null : card.filterId)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className={cn("h-4 w-4", card.className)} />
            </CardHeader>
            <CardContent>
              {card.isTicker ? (
                <div className="relative group/ticker overflow-hidden">
                  <div className="text-xl font-bold truncate whitespace-nowrap mask-fade-right">
                    {card.value}
                  </div>
                </div>
              ) : (
                <div className="text-2xl font-bold">{card.value}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );

        if (card.isTicker && stats.todayRevenue.length > 0) {
          return (
            <SimpleTooltip 
              key={card.title}
              side="bottom"
              content={
                <div className="flex flex-col gap-1 p-1">
                  <p className="font-bold border-b border-white/10 pb-1 mb-1">Cortes del día</p>
                  {stats.todayRevenue.map(r => (
                    <div key={r.currency} className="flex justify-between gap-4 text-xs">
                      <span className="opacity-70">{r.currency}</span>
                      <span className="font-mono">{ValueConverter.format(r.amount / 100, "", currencyFormat)}</span>
                    </div>
                  ))}
                </div>
              }
            >
              {content}
            </SimpleTooltip>
          );
        }

        return content;
      })}
    </div>
  );
}
