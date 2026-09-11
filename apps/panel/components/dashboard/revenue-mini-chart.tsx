"use client";

import * as React from "react";
import { SimpleChart, type ChartConfig } from "@workspace/ui";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import {
  lastSixMonths,
  REVENUE_MINI_CONFIG,
  type MonthlyRevenueRow,
} from "@/lib/dashboard/revenue-summary";

interface RevenueMiniChartProps {
  readonly monthlyReport: MonthlyRevenueRow[];
}

/**
 * Mini-gráfica de ingresos de los últimos 6 meses. Fuente única:
 * `monthlyReport` (`GET /api/reports/revenue` vía RSC), nunca
 * `analytics.chartData` para no duplicar llamadas.
 */
export function RevenueMiniChart({ monthlyReport }: Readonly<RevenueMiniChartProps>) {
  const data = React.useMemo(() => lastSixMonths(monthlyReport), [monthlyReport]);

  return (
    <Card data-testid="dashboard-revenue-mini" className="overflow-hidden pb-0 flex flex-col">
      <div className="p-6 pb-4 border-b border-border">
        <Text as="p" size="lg" weight="bold">Ingresos 6 meses</Text>
        <Text as="p" size="xs" variant="muted" className="mt-1">
          Recaudación mensual normalizada.
        </Text>
      </div>
      <div className="flex-1 min-h-0 p-4 pt-2">
        <div className="h-[190px] w-full">
          {data.length > 0 ? (
            <SimpleChart
              type="bar"
              data={data}
              index="mes"
              categories={["Monto"]}
              config={REVENUE_MINI_CONFIG as ChartConfig}
              showLegend={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
              Sin ingresos registrados.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
