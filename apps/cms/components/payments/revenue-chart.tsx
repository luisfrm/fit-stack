"use client";

import * as React from "react";
import { Card, CardContent, SimpleChart, ChartConfig, ChartHeader, useChartPagination, Spinner } from "@workspace/ui";
import { CurrencyFormat, ValueConverter } from "@/lib/utils/value-converters";
import { useRevenueReport } from "@/lib/hooks/use-payments";

// Helper function extracted to prevent unstable nested components warning
function customTooltipFormatter(
  value: string | number | readonly (string | number)[] | undefined,
  name: string | number | readonly (string | number)[] | undefined,
  item: { payload?: Record<string, string | number>; color?: string },
  index: number,
  payload: readonly unknown[],
  baseCurrency: string,
  currencyFormat: CurrencyFormat,
  timeframe: '30d' | '12m'
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
  const [timeframe, setTimeframe] = React.useState<'30d' | '12m'>('30d');

  // Fetch 12m data only when requested
  const { data: monthlyData, isLoading: isMonthlyLoading } = useRevenueReport(baseCurrency, '12m');

  // 1. Transform raw data into grouped format for SimpleChart
  const processedData = React.useMemo(() => {
    const activeData = timeframe === '30d' ? data : (monthlyData || []);
    if (!activeData || activeData.length === 0) return [];

    const grouped: Record<string, Record<string, string | number>> = {};

    activeData.forEach((item: any) => {
      let dateLabel = '';
      
      if (timeframe === '30d') {
        const dateObj = new Date(item.day);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        dateLabel = `${day}-${month}`;
      } else {
        const dateObj = new Date(item.month);
        // "Ene", "Feb", etc.
        dateLabel = dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
        dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
      }

      let group = grouped[dateLabel];
      if (!group) {
        group = { dateLabel };
        grouped[dateLabel] = group;
      }

      // El valor para la gráfica es el normalizado
      group[item.currency] = (group[item.currency] as number || 0) + (item.normalizedAmount / 100);
      // Guardamos el original para el tooltip
      group[`${item.currency}_raw`] = (group[`${item.currency}_raw`] as number || 0) + (item.amount / 100);
    });

    const currencies = Array.from(new Set(activeData.map((d: any) => d.currency)));

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
  }, [data, monthlyData, timeframe]);

  // 2. Handle Pagination
  const {
    slicedData,
    viewWindow,
    onPrev,
    onNext,
    canPrev,
    canNext,
    setViewWindow
  } = useChartPagination(processedData, { initialWindow: timeframe === '30d' ? 7 : 12 });

  // 3. Generate Chart Config
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    const activeData = timeframe === '30d' ? data : (monthlyData || []);
    const currencies = Array.from(new Set(activeData.map((d: any) => d.currency)));

    currencies.forEach((curr, idx) => {
      const colors = ["#EAB308", "#3B82F6", "#EF4444", "#10B981", "#8B5CF6"];
      config[curr] = {
        label: curr,
        color: colors[idx % colors.length],
      };
    });

    return config;
  }, [data, monthlyData, timeframe]);

  const categories = Object.keys(chartConfig);

  const windowOptions = timeframe === '30d' 
    ? [
        { label: "7d", value: 7 },
        { label: "14d", value: 14 },
        { label: "30d", value: 30 },
        { label: "12m", value: "12m" }, // Switch to monthly
      ]
    : [
        { label: "30d", value: "30d" }, // Switch back to daily
        { label: "6m", value: 6 },
        { label: "12m", value: 12 },
      ];

  const handleViewChange = (val: string | number) => {
    if (val === '12m' && timeframe === '30d') {
      setTimeframe('12m');
    } else if (val === '30d' && timeframe === '12m') {
      setTimeframe('30d');
    } else {
      setViewWindow(val);
    }
  };

  return (
    <Card variant="glass" className="w-full h-full flex flex-col">
      <ChartHeader
        title={timeframe === '30d' ? "Ingresos (Diario)" : "Ingresos (Mensual)"}
        description={timeframe === '30d' ? "Recaudación real de los últimos 30 días." : "Consolidado histórico de los últimos 12 meses."}
        viewWindow={viewWindow}
        onViewWindowChange={handleViewChange}
        onPrev={onPrev}
        onNext={onNext}
        canPrev={canPrev}
        canNext={canNext}
        options={windowOptions}
        className="flex-none"
      />
      <CardContent className="flex-1 flex flex-col relative">
        {isMonthlyLoading && timeframe === '12m' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/20 backdrop-blur-sm rounded-xl">
            <Spinner className="size-8 text-primary" />
          </div>
        )}
        
        <div className="h-[300px] w-full mt-auto">
          {processedData.length > 0 ? (
            <SimpleChart
              type="line"
              data={slicedData}
              index="dateLabel"
              categories={categories}
              config={chartConfig}
              variant="glass"
              showGrid={true}
              showYAxis={true}
              yAxisFormatter={(val) => {
                return Number(val) >= 1000 ? `${(Number(val) / 1000).toFixed(0)}k` : String(val);
              }}
              tooltipFormatter={(value, name, item, index, payload) =>
                customTooltipFormatter(value, name, item, index, payload, baseCurrency, currencyFormat, timeframe)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {!isMonthlyLoading && "No hay datos suficientes para el periodo seleccionado."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
