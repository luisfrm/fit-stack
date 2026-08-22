import type { ChartConfig } from "@workspace/ui";

type PlansDistribution = Array<{ planName: string; count: number }>;
type PaymentMethods = Array<{
  method: string;
  count: number;
  breakdown: Record<string, number>;
}>;
type Renewals = Array<{ day: string; count: number }>;
type Growth = {
  altas: Array<{ day: string; count: number }>;
  bajas: Array<{ day: string; count: number }>;
};

export type PlansChartData = Array<{ plan: string; Suscriptores: number }>;
export type MethodsChartData = Array<{
  metodo: string;
  Transacciones: number;
  breakdown: Record<string, number>;
}>;
export type RenewalsChartData = Array<{ dia: string; Vencimientos: number }>;
export type GrowthChartData = Array<{ dia: string; Altas: number; Bajas: number }>;

/** Suscriptores activos distribuidos por plan. */
export function buildPlansData(plans: PlansDistribution | undefined): PlansChartData {
  return plans?.map((item) => ({
    plan: item.planName,
    Suscriptores: item.count,
  })) ?? [];
}

export const PLANS_CHART_CONFIG: ChartConfig = {
  Suscriptores: { label: "Suscriptores Activos", color: "var(--color-primary)" },
};

/** Volumen transaccional por método de pago (con breakdown por divisa para tooltip). */
export function buildMethodsData(methods: PaymentMethods | undefined): MethodsChartData {
  return methods?.map((item) => ({
    metodo: item.method?.replaceAll('_', ' '),
    Transacciones: item.count,
    breakdown: item.breakdown,
  })) ?? [];
}

export const METHODS_CHART_CONFIG: ChartConfig = {
  Transacciones: { label: "Transacciones", color: "var(--color-primary)" },
};

/** Vencimientos programados para los próximos 30 días. */
export function buildRenewalsData(renewals: Renewals | undefined): RenewalsChartData {
  return renewals?.map((item) => {
    const [, m, d] = item.day.split('-');
    return { dia: `${d}-${m}`, Vencimientos: item.count };
  }) ?? [];
}

export const RENEWALS_CHART_CONFIG: ChartConfig = {
  Vencimientos: { label: "Vencimientos", color: "var(--color-primary)" },
};

/**
 * Altas vs bajas (bajas negativas, diverging bar) de los últimos 30 días,
 * ordenadas cronológicamente.
 */
export function buildGrowthData(growth: Growth | undefined): GrowthChartData {
  const map: Record<string, { dia: string; Altas: number; Bajas: number }> = {};

  growth?.altas?.forEach((a) => {
    const [, m, d] = a.day.split('-');
    const dia = `${d}-${m}`;
    map[dia] = { dia, Altas: a.count, Bajas: 0 };
  });

  growth?.bajas?.forEach((b) => {
    const [, m, d] = b.day.split('-');
    const dia = `${d}-${m}`;
    if (!map[dia]) map[dia] = { dia, Altas: 0, Bajas: 0 };
    // Bajas represented as negative numbers for diverging bar chart
    map[dia].Bajas = -b.count;
  });

  return Object.values(map).sort((a, b) => {
    const [d1, m1] = a.dia.split('-');
    const [d2, m2] = b.dia.split('-');
    if (m1 !== m2) return Number(m1) - Number(m2);
    return Number(d1) - Number(d2);
  });
}

export const GROWTH_CHART_CONFIG: ChartConfig = {
  Altas: { label: "Altas", color: "var(--color-chart-4)" },
  Bajas: { label: "Bajas", color: "var(--color-destructive)" },
};