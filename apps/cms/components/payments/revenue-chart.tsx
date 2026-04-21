"use client";

import * as React from "react";
import { Card, CardContent, SimpleChart, ChartConfig, ChartHeader, useChartPagination } from "@workspace/ui";
import { CurrencyFormat, ValueConverter } from "@/lib/utils/value-converters";

// Helper function extracted to prevent unstable nested components warning
function customTooltipFormatter(
  value: string | number | readonly (string | number)[] | undefined,
  name: string | number | readonly (string | number)[] | undefined,
  item: { payload?: Record<string, string | number>; color?: string },
  index: number,
  payload: readonly unknown[],
  baseCurrency: string,
  currencyFormat: CurrencyFormat
) {
  // Convert ValueType (which could be an array in Recharts) to a single value
  const finalValue = Array.isArray(value) ? value[0] : value;
  const finalName = Array.isArray(name) ? name[0] : name;

  if (finalValue === undefined || finalName === undefined || !item.payload) return null;

  const rawVal = item.payload?.[`${finalName}_raw`];
  const showConversion = finalName !== baseCurrency;

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
        <span className="text-muted-foreground font-medium">{finalName}</span>
      </div>
      <div className="flex items-baseline gap-1.5 ml-auto">
        <span className="font-mono font-medium text-foreground">
          {ValueConverter.format(rawVal as number, String(finalName), currencyFormat)}
        </span>
        {showConversion && (
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            (Eq: {ValueConverter.format(Number(finalValue), baseCurrency, currencyFormat)})
          </span>
        )}
      </div>
    </div>
  );
}

interface RevenueChartProps {
  data: Array<{
    day: string;
    currency: string;
    amount: number;
    normalizedAmount: number;
  }>;
  baseCurrency: string;
  currencyFormat: CurrencyFormat;
}

export function RevenueChart({
  data,
  baseCurrency,
  currencyFormat
}: Readonly<RevenueChartProps>) {
  // 1. Transform raw data into grouped format for SimpleChart
  const processedData = React.useMemo(() => {
    const grouped: Record<string, Record<string, string | number>> = {};

    data.forEach((item) => {
      const dateObj = new Date(item.day);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const date = `${day}-${month}`; // DD-MM format

      if (!grouped[date]) {
        grouped[date] = { date };
      }

      // El valor para la gráfica es el normalizado
      grouped[date][item.currency] = item.normalizedAmount / 100;
      // Guardamos el original para el tooltip
      grouped[date][`${item.currency}_raw`] = item.amount / 100;
    });

    const currencies = Array.from(new Set(data.map((d) => d.currency)));

    // Convert property map to array and fill missing currencies with 0 to enable continuous lines
    return Object.values(grouped).map(group => {
      const g = { ...group };
      currencies.forEach(curr => {
        if (g[curr] === undefined) {
          g[curr] = 0;
          g[`${curr}_raw`] = 0;
        }
      });
      return g;
    });
  }, [data]);

  // 2. Handle Pagination with our new hook
  const {
    slicedData,
    viewWindow,
    onPrev,
    onNext,
    canPrev,
    canNext,
    setViewWindow
  } = useChartPagination(processedData);

  // 3. Generate Chart Config based on active currencies
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    const currencies = Array.from(new Set(data.map((d) => d.currency)));

    currencies.forEach((curr, idx) => {
      const colors = ["#EAB308", "#3B82F6", "#EF4444", "#10B981", "#8B5CF6"];
      config[curr] = {
        label: curr,
        color: colors[idx % colors.length],
      };
    });

    return config;
  }, [data]);

  const categories = Object.keys(chartConfig);

  const windowOptions = [
    { label: "7d", value: 7 },
    { label: "14d", value: 14 },
    { label: "30d", value: 30 },
  ];

  return (
    <Card variant="glass" className="w-full h-full flex flex-col">
      <ChartHeader
        title="Ingresos por Moneda"
        description="Métricas de recaudación neta (montos reales sin normalizar)."
        viewWindow={viewWindow}
        onViewWindowChange={setViewWindow}
        onPrev={onPrev}
        onNext={onNext}
        canPrev={canPrev}
        canNext={canNext}
        options={windowOptions}
        className="flex-none"
      />
      <CardContent className="flex-1 flex flex-col">
        <div className="h-[300px] w-full mt-auto">
          {processedData.length > 0 ? (
            <SimpleChart
              type="line"
              data={slicedData}
              index="date"
              categories={categories}
              config={chartConfig}
              variant="glass"
              showGrid={true}
              showYAxis={true}
              yAxisFormatter={(val) => {
                return Number(val) >= 1000 ? `${(Number(val) / 1000).toFixed(0)}k` : String(val);
              }}
              tooltipFormatter={(value, name, item, index, payload) =>
                customTooltipFormatter(value, name, item, index, payload, baseCurrency, currencyFormat)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No hay datos suficientes para el periodo seleccionado.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
