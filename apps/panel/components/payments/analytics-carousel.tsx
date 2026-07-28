"use client";

import * as React from "react";
import { SimpleChart, ChartConfig, ChartCarousel } from "@workspace/ui";
import { CurrencyFormat, ValueConverter } from "@/lib/utils/value-converters";

interface AnalyticsCarouselProps {
  data: {
    plansDistribution: Array<{ planName: string; count: number }>;
    paymentMethods: Array<{ method: string; count: number; breakdown: Record<string, number> }>;
    renewals: Array<{ day: string; count: number }>;
    growth: {
      altas: Array<{ day: string; count: number }>;
      bajas: Array<{ day: string; count: number }>;
    };
  };
  currencyFormat: CurrencyFormat;
}

export function AnalyticsCarousel({ data, currencyFormat }: Readonly<AnalyticsCarouselProps>) {
  
  // 1. Suscripciones por Plan
  const plansData = React.useMemo(() => {
    return data.plansDistribution?.map((item) => ({
      plan: item.planName,
      Suscriptores: item.count,
    })) || [];
  }, [data.plansDistribution]);
  const plansConfig: ChartConfig = { Suscriptores: { label: "Suscriptores Activos", color: "var(--color-primary)" } };

  // 2. Métodos de Pago
  const methodsData = React.useMemo(() => {
    return data.paymentMethods?.map((item) => ({
      metodo: item.method?.replaceAll('_', ' '),
      Transacciones: item.count,
      breakdown: item.breakdown, // For tooltip
    })) || [];
  }, [data.paymentMethods]);
  
  const methodsConfig: ChartConfig = { Transacciones: { label: "Transacciones", color: "var(--color-primary)" } };

  // Helper for Payment Methods tooltip
  const renderMethodsTooltip = (value: any, name: any, item: any) => {
    if (!item.payload) return null;
    const breakdown = item.payload.breakdown as Record<string, number>;
    
    return (
      <div className="flex flex-col gap-2 w-full min-w-[200px]">
        <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-border">
          <span className="font-bold text-foreground capitalize">{item.payload.metodo}</span>
          <span className="ml-auto text-xs text-muted-foreground">{value} transacciones</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Ingresos por Divisa</span>
          {Object.entries(breakdown).map(([currency, amount]) => (
            <div key={currency} className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{currency}</span>
              <span className="font-mono font-medium">{ValueConverter.format(amount / 100, currency, currencyFormat)}</span>
            </div>
          ))}
          {Object.keys(breakdown).length === 0 && (
            <span className="text-xs text-muted-foreground italic">Sin ingresos registrados</span>
          )}
        </div>
      </div>
    );
  };

  // 3. Proyección de Renovaciones
  const renewalsData = React.useMemo(() => {
    return data.renewals?.map((item) => {
      const [, m, d] = item.day.split('-');
      return {
        dia: `${d}-${m}`,
        Vencimientos: item.count,
      };
    }) || [];
  }, [data.renewals]);
  const renewalsConfig: ChartConfig = { Vencimientos: { label: "Vencimientos", color: "var(--color-primary)" } };

  // 4. Crecimiento Neto
  const growthData = React.useMemo(() => {
    const map: Record<string, { dia: string; Altas: number; Bajas: number }> = {};
    
    data.growth?.altas?.forEach(a => {
      const [, m, d] = a.day.split('-');
      const dia = `${d}-${m}`;
      map[dia] = { dia, Altas: a.count, Bajas: 0 };
    });

    data.growth?.bajas?.forEach(b => {
      const [, m, d] = b.day.split('-');
      const dia = `${d}-${m}`;
      if (!map[dia]) map[dia] = { dia, Altas: 0, Bajas: 0 };
      // Bajas represented as negative numbers for diverging bar chart
      map[dia].Bajas = -b.count; 
    });

    // Sort by date strings conceptually
    return Object.values(map).sort((a, b) => {
      const [d1, m1] = a.dia.split('-');
      const [d2, m2] = b.dia.split('-');
      if (m1 !== m2) return Number(m1) - Number(m2);
      return Number(d1) - Number(d2);
    });
  }, [data.growth]);
  
  const growthConfig: ChartConfig = {
    Altas: { label: "Altas", color: "var(--color-chart-4)" }, // Greenish
    Bajas: { label: "Bajas", color: "var(--color-destructive)" }, // Red
  };

  const views = [
    {
      id: "plans",
      title: "Suscripciones por Plan",
      description: "Usuarios activos distribuidos según su membresía.",
      renderChart: () => plansData.length > 0 ? (
        <SimpleChart type="bar" data={plansData} index="plan" categories={["Suscriptores"]} config={plansConfig} showLegend={false} />
      ) : <EmptyState message="No hay suscripciones activas." />
    },
    {
      id: "methods",
      title: "Métodos de Pago",
      description: "Volumen transaccional por vía de pago (Últimos 30 días).",
      renderChart: () => methodsData.length > 0 ? (
        <SimpleChart 
          type="bar" 
          data={methodsData} 
          index="metodo" 
          categories={["Transacciones"]} 
          config={methodsConfig} 
          showLegend={false}
          tooltipFormatter={renderMethodsTooltip}
        />
      ) : <EmptyState message="No hay transacciones recientes." />
    },
    {
      id: "projections",
      title: "Proyección de Renovaciones",
      description: "Vencimientos programados para los próximos 30 días.",
      renderChart: () => renewalsData.length > 0 ? (
        <SimpleChart type="bar" data={renewalsData} index="dia" categories={["Vencimientos"]} config={renewalsConfig} showLegend={false} />
      ) : <EmptyState message="No hay vencimientos próximos." />
    },
    {
      id: "growth",
      title: "Crecimiento Neto",
      description: "Altas vs Bajas en los últimos 30 días.",
      renderChart: () => growthData.length > 0 ? (
        <SimpleChart type="bar" stacked data={growthData} index="dia" categories={["Altas", "Bajas"]} config={growthConfig} showLegend={true} />
      ) : <EmptyState message="No hay altas ni bajas recientes." />
    }
  ];

  return <ChartCarousel views={views} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
      {message}
    </div>
  );
}