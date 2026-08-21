export interface QuotaUsage {
  used: number;
  limit: number;
}

export interface AiUsage {
  daily: QuotaUsage;
  weekly: QuotaUsage;
  monthly: QuotaUsage;
}

/** Una cuota está agotada cuando tiene límite (> 0) y el uso lo alcanzó. */
export function isQuotaExhausted(quota: QuotaUsage | undefined | null): boolean {
  return !!quota && quota.limit > 0 && quota.used >= quota.limit;
}

/** Formatea "usado/límite" con ∞ para límite 0 (ilimitado). */
export function formatQuotaLabel(quota: QuotaUsage | undefined | null): string {
  if (!quota) return "—";
  return `${quota.used}/${quota.limit === 0 ? "∞" : quota.limit}`;
}