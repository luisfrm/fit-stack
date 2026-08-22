"use client";

import * as React from "react";
import { SimpleChart, type ChartConfig } from "@workspace/ui";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import {
  buildPlansData,
  buildRenewalsData,
  buildGrowthData,
  PLANS_CHART_CONFIG,
  RENEWALS_CHART_CONFIG,
  GROWTH_CHART_CONFIG,
} from "@/lib/charts/analytics-shapes";

interface AnalyticsSlice {
  plansDistribution: Array<{ planName: string; count: number }>;
  renewals: Array<{ day: string; count: number }>;
  growth: {
    altas: Array<{ day: string; count: number }>;
    bajas: Array<{ day: string; count: number }>;
  };
}

interface DashboardChartsRowProps {
  readonly analytics: AnalyticsSlice | null;
}

function ChartEmptyState({ message }: Readonly<{ message: string }>) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
      {message}
    </div>
  );
}

/**
 * Fila analítica del dashboard: 3 gráficas compactas (1/3 cada una) con los
 * datos que ya produce GET /payments/analytics.
 */
export function DashboardChartsRow({ analytics }: Readonly<DashboardChartsRowProps>) {
  const plansData = React.useMemo(
    () => buildPlansData(analytics?.plansDistribution),
    [analytics?.plansDistribution],
  );
  const renewalsData = React.useMemo(
    () => buildRenewalsData(analytics?.renewals),
    [analytics?.renewals],
  );
  const growthData = React.useMemo(
    () => buildGrowthData(analytics?.growth),
    [analytics?.growth],
  );

  if (!analytics) return null;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
      <ChartCard
        title="Crecimiento Neto"
        description="Altas vs Bajas en los últimos 30 días."
      >
        {growthData.length > 0 ? (
          <SimpleChart
            type="bar"
            stacked
            data={growthData}
            index="dia"
            categories={["Altas", "Bajas"]}
            config={GROWTH_CHART_CONFIG as ChartConfig}
            showLegend
          />
        ) : (
          <ChartEmptyState message="No hay altas ni bajas recientes." />
        )}
      </ChartCard>

      <ChartCard
        title="Proyección de Renovaciones"
        description="Vencimientos programados para los próximos 30 días."
      >
        {renewalsData.length > 0 ? (
          <SimpleChart
            type="bar"
            data={renewalsData}
            index="dia"
            categories={["Vencimientos"]}
            config={RENEWALS_CHART_CONFIG as ChartConfig}
            showLegend={false}
          />
        ) : (
          <ChartEmptyState message="No hay vencimientos próximos." />
        )}
      </ChartCard>

      <ChartCard
        title="Suscripciones por Plan"
        description="Usuarios activos distribuidos según su membresía."
      >
        {plansData.length > 0 ? (
          <SimpleChart
            type="bar"
            data={plansData}
            index="plan"
            categories={["Suscriptores"]}
            config={PLANS_CHART_CONFIG as ChartConfig}
            showLegend={false}
          />
        ) : (
          <ChartEmptyState message="No hay suscripciones activas." />
        )}
      </ChartCard>
    </section>
  );
}

function ChartCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <Card className="overflow-hidden pb-0 flex flex-col">
      <div className="p-6 pb-4 border-b border-border">
        <Text as="p" size="lg" weight="bold">{title}</Text>
        <Text as="p" size="xs" variant="muted" className="mt-1">{description}</Text>
      </div>
      <div className="flex-1 min-h-0 p-4 pt-2">
        <div className="h-[190px] w-full">{children}</div>
      </div>
    </Card>
  );
}