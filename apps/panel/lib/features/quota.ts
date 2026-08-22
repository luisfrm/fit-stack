export interface QuotaUsage {
  used: number;
  limit: number;
}

export interface AiUsage {
  monthly: QuotaUsage;
  remaining: number | null;
  disabled: boolean;
  periodStart: string;
}

/** Una cuota está agotada cuando tiene límite (> 0) y el uso lo alcanzó. */
export function isQuotaExhausted(quota: QuotaUsage | undefined | null): boolean {
  return !!quota && quota.limit > 0 && quota.used >= quota.limit;
}

/** Formatea "usado/límite"; si límite 0 retorna "Ilimitado". */
export function formatQuotaLabel(quota: QuotaUsage | undefined | null): string {
  if (!quota) return "—";
  if (quota.limit === 0) return "Ilimitado";
  return `${quota.used}/${quota.limit}`;
}

/** Texto para restantes: null → Ilimitado. */
export function formatRemaining(remaining: number | null | undefined): string {
  if (remaining === null || remaining === undefined) return "Ilimitado";
  return String(remaining);
}
