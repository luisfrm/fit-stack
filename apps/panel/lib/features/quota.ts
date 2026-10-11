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

/** A quota is exhausted when it has a limit (> 0) and usage reaches or exceeds it. */
export function isQuotaExhausted(quota: QuotaUsage | undefined | null): boolean {
  return !!quota && quota.limit > 0 && quota.used >= quota.limit;
}

/** Formats "used/limit"; if limit is 0 returns "Ilimitado". */
export function formatQuotaLabel(quota: QuotaUsage | undefined | null): string {
  if (!quota) return "—";
  if (quota.limit === 0) return "Ilimitado";
  return `${quota.used}/${quota.limit}`;
}

/** Text for remaining units: null → Ilimitado. */
export function formatRemaining(remaining: number | null | undefined): string {
  if (remaining === null || remaining === undefined) return "Ilimitado";
  return String(remaining);
}
