import type { ChartConfig } from "@workspace/ui";
import { centsToUnits } from "@workspace/shared";

export interface MonthlyRevenueRow {
  readonly month: string;
  readonly currency: string;
  readonly amount: number;
  /**
   * Cents in the organization primary currency, using each payment's
   * persisted historical rate. Only exact normalizations are included.
   */
  readonly normalizedAmount: number;
  /** Raw cents that could not be normalized (never assumed to be 1:1). */
  readonly unconvertedAmount: number;
  readonly unconvertedCount: number;
  readonly originalExchangeRate: string | null;
}

export type RevenueMiniData = Array<{ mes: string; Monto: number }>;

export interface TodayRevenueRow {
  readonly currency: string;
  readonly amount: number;
  readonly normalizedAmount: number;
  readonly unconvertedAmount: number;
  readonly unconvertedCount: number;
}

export interface TodayIncomeSummary {
  /** Normalized major units, or null when any payment lacks an exact rate. */
  readonly amount: number | null;
  readonly currency: string;
  /** True when at least one payment could not be normalized. */
  readonly incomplete: boolean;
  readonly unconvertedCount: number;
}

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

/** True when any row of the report has payments without an exact rate. */
export function hasUnconvertedRevenue(rows: readonly MonthlyRevenueRow[]): boolean {
  return rows.some((row) => row.unconvertedCount > 0);
}

/**
 * Today's income KPI. The API already normalized each payment with its
 * persisted rate; this helper only adds the groups. A partial total is NEVER
 * displayed as if it were complete: `amount` is null when something could not
 * be normalized, and `incomplete` tells the UI why.
 */
export function summarizeTodayIncome(
  rows: readonly TodayRevenueRow[] | undefined,
  primaryCurrency: string,
): TodayIncomeSummary {
  if (!rows || rows.length === 0) {
    return {
      amount: 0,
      currency: primaryCurrency,
      incomplete: false,
      unconvertedCount: 0,
    };
  }

  const normalizedCents = rows.reduce(
    (acc, row) => acc + row.normalizedAmount,
    0,
  );
  const unconvertedCount = rows.reduce(
    (acc, row) => acc + row.unconvertedCount,
    0,
  );
  const incomplete = rows.some((row) => row.unconvertedAmount > 0);

  return {
    amount: incomplete ? null : centsToUnits(normalizedCents),
    currency: primaryCurrency,
    incomplete,
    unconvertedCount,
  };
}

export const REVENUE_MINI_CONFIG: ChartConfig = {
  Monto: { label: "Ingresos", color: "var(--color-primary)" },
};

/**
 * CSV del reporte mensual (exportación del botón "Reporte").
 * Puro y testeable: el Blob/download vive en el componente cliente.
 */
export function buildMonthlyCsv(rows: MonthlyRevenueRow[], baseCurrency: string): string {
  const header =
    "mes,moneda,monto,monto_normalizado,no_convertido,pagos_sin_tasa,moneda_base";
  const lines = rows.map((r) =>
    [
      r.month,
      r.currency,
      String(r.amount),
      String(r.normalizedAmount),
      String(r.unconvertedAmount),
      String(r.unconvertedCount),
      baseCurrency,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
