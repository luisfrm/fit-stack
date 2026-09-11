"use client";

import * as React from "react";
import { SimpleChart, type ChartConfig } from "@workspace/ui";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import {
  fillGrowthGaps,
  MEMBER_GROWTH_CONFIG,
} from "@/lib/members/member-stats-selectors";
import type { IMemberGrowthPoint } from "@workspace/shared/types";

interface MembersGrowthChartProps {
  readonly growth: IMemberGrowthPoint[];
  readonly timezone: string | null | undefined;
}

/**
 * Gráfica de altas de clientes (últimos 6 meses). Fuente: `growth` de
 * `GET /api/members/stats` (dominio miembro, nada de pagos).
 */
export function MembersGrowthChart({ growth, timezone }: Readonly<MembersGrowthChartProps>) {
  const data = React.useMemo(() => fillGrowthGaps(growth, timezone), [growth, timezone]);

  return (
    <Card data-testid="members-growth-chart" className="overflow-hidden pb-0 flex flex-col">
      <div className="p-6 pb-4 border-b border-border">
        <Text as="p" size="lg" weight="bold">Altas 6 meses</Text>
        <Text as="p" size="xs" variant="muted" className="mt-1">
          Nuevos clientes por mes.
        </Text>
      </div>
      <div className="flex-1 min-h-0 p-4 pt-2">
        <div className="h-[190px] w-full">
          {data.some((d) => d.Altas > 0) ? (
            <SimpleChart
              type="bar"
              data={data}
              index="mes"
              categories={["Altas"]}
              config={MEMBER_GROWTH_CONFIG as ChartConfig}
              showLegend={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
              Sin altas recientes.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
