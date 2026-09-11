import { localMonthStartUtc, toLocalMonthString } from "@workspace/shared/date";
import type { IMemberGrowthPoint } from "@workspace/shared/types";
import type { ChartConfig } from "@workspace/ui";

export type MemberGrowthData = Array<{ mes: string; Altas: number }>;

export const MEMBER_GROWTH_CONFIG: ChartConfig = {
  Altas: { label: "Altas", color: "var(--color-primary)" },
};

/**
 * Rellena con 0 los meses sin altas para una serie continua de 6 meses
 * terminando en el mes local actual. Los buckets del backend solo traen
 * meses con actividad (`getMemberGrowth`).
 */
export function fillGrowthGaps(
  growth: IMemberGrowthPoint[],
  tz: string | null | undefined,
): MemberGrowthData {
  const byMonth = new Map(growth.map((g) => [g.month, g.count]));
  const out: MemberGrowthData = [];
  for (let ago = 5; ago >= 0; ago--) {
    const mes = toLocalMonthString(tz, localMonthStartUtc(tz, ago));
    out.push({ mes, Altas: byMonth.get(mes) ?? 0 });
  }
  return out;
}

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

/** 'YYYY-MM-DD' → '15 jun' (display de cumpleaños, sin año). */
export function formatBirthdayDay(birthday: string): string {
  const [, m, d] = birthday.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]}`;
}
