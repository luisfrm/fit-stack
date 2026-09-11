import type { ChartConfig } from "@workspace/ui";

export interface MonthlyRevenueRow {
  readonly month: string;
  readonly currency: string;
  readonly amount: number;
  readonly normalizedAmount: number;
  readonly originalExchangeRate: string;
}

export type RevenueMiniData = Array<{ mes: string; Monto: number }>;

/**
 * Últimos 6 buckets del reporte mensual (`financeService.getRevenueReport`,
 * fuente única — NO `analytics.chartData`). Agrega por mes sumando el monto
 * ya normalizado a la divisa primaria.
 */
export function lastSixMonths(rows: MonthlyRevenueRow[]): RevenueMiniData {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.normalizedAmount);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-6)
    .map(([mes, Monto]) => ({ mes, Monto }));
}

export const REVENUE_MINI_CONFIG: ChartConfig = {
  Monto: { label: "Ingresos", color: "var(--color-primary)" },
};

/**
 * CSV del reporte mensual (exportación del botón "Reporte").
 * Puro y testeable: el Blob/download vive en el componente cliente.
 */
export function buildMonthlyCsv(rows: MonthlyRevenueRow[], baseCurrency: string): string {
  const header = "mes,moneda,monto,monto_normalizado,moneda_base";
  const lines = rows.map((r) =>
    [r.month, r.currency, String(r.amount), String(r.normalizedAmount), baseCurrency].join(","),
  );
  return [header, ...lines].join("\n");
}
