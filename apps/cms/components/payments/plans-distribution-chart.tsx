"use client";

import * as React from "react";
import { Card, CardContent, SimpleChart, ChartConfig, ChartHeader } from "@workspace/ui";

interface PlansDistributionChartProps {
  data: Array<{
    planName: string;
    count: number;
  }>;
}

export function PlansDistributionChart({
  data
}: Readonly<PlansDistributionChartProps>) {
  // 1. Transform raw data
  const processedData = React.useMemo(() => {
    // Para simplificar la visualización en el BarChart, mapeamos el nombre del plan como la categoría X
    // y asignamos el count a una llave estática 'Activos'. Si se quisiera apilar, el objeto sería diferente.
    return data.map((item) => ({
      plan: item.planName,
      Suscriptores: item.count,
    }));
  }, [data]);

  // 2. Chart Config for colors
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {
      Suscriptores: {
        label: "Suscriptores Activos",
        color: "var(--color-primary)",
      }
    };
    return config;
  }, []);

  return (
    <Card variant="glass" className="w-full h-full flex flex-col">
      <ChartHeader
        title="Suscripciones por Plan"
        description="Usuarios activos distribuidos según su membresía."
        viewWindow={"all"}
        onViewWindowChange={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        canPrev={false}
        canNext={false}
        options={[{ label: "Total", value: "all" }]}
        className="flex-none"
      />
      <CardContent className="flex-1 flex flex-col">
        <div className="h-[300px] w-full mt-auto">
          {processedData.length > 0 ? (
            <SimpleChart
              type="bar"
              data={processedData}
              index="plan"
              categories={["Suscriptores"]}
              config={chartConfig}
              variant="glass"
              showGrid={true}
              showYAxis={true}
              showLegend={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
              No hay suscripciones activas.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}