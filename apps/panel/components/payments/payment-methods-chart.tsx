"use client";

import * as React from "react";
import { Card, CardContent, SimpleChart } from "@workspace/ui";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { buildMethodsData, METHODS_CHART_CONFIG } from "@/lib/charts/analytics-shapes";

interface PaymentMethodsSlice {
  paymentMethods: Array<{
    method: string;
    count: number;
    breakdown: Record<string, number>;
  }>;
}

interface PaymentMethodsChartProps {
  readonly data: PaymentMethodsSlice | null;
  readonly currencyFormat: CurrencyFormat;
}

function renderMethodsTooltip(
  value: unknown,
  name: unknown,
  item: { payload?: Record<string, unknown> },
  currencyFormat: CurrencyFormat,
) {
  if (!item.payload) return null;
  const breakdown = (item.payload.breakdown ?? {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-2 w-full min-w-[200px]">
      <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-border">
        <span className="font-bold text-foreground capitalize">{String(item.payload.metodo)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{String(value)} transacciones</span>
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
}

/**
 * Card fija "Métodos de Pago": reemplaza al AnalyticsCarousel en la página
 * de Pagos; las demás vistas del carrusel viven ahora en el dashboard.
 */
export function PaymentMethodsChart({ data, currencyFormat }: Readonly<PaymentMethodsChartProps>) {
  const methodsData = React.useMemo(
    () => buildMethodsData(data?.paymentMethods),
    [data?.paymentMethods],
  );

  return (
    <Card variant="glass" className="w-full h-full flex flex-col">
      <div className="p-6 pb-4">
        <p className="text-lg font-bold leading-none tracking-tight">Métodos de Pago</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          Volumen transaccional por vía de pago (Últimos 30 días).
        </p>
      </div>
      <CardContent className="flex-1 flex flex-col">
        <div className="h-[300px] w-full mt-auto">
          {methodsData.length > 0 ? (
            <SimpleChart
              type="bar"
              data={methodsData}
              index="metodo"
              categories={["Transacciones"]}
              config={METHODS_CHART_CONFIG}
              showLegend={false}
              tooltipFormatter={(value, name, item) =>
                renderMethodsTooltip(value, name, item, currencyFormat)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">
              No hay transacciones recientes.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}