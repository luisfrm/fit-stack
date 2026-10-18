/* ── Exchange rates — cache with an EXPLICIT last-known fallback ─────────
   The provider response is the ONLY source of truth for conversion rates.
   A rate is never invented (`?? 1`, `?? 0`): when the provider fails we
   either reuse a previously cached success for the SAME base currency
   (exposed as `stale` with its provider timestamp) or fail so the caller
   can block the payment.
   ─────────────────────────────────────────────────────────────────────── */

/** State of the load performed by a consumer (never persisted). */
export type ExchangeRateLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ExchangeRateSnapshot {
  readonly baseCurrency: string;
  readonly rates: Record<string, number>;
  /** True when `rates` come from the last-known cache because the provider failed. */
  readonly stale: boolean;
  /** Provider-reported update time in epoch milliseconds, when available. */
  readonly providerUpdatedAt: number | null;
}

export interface ExchangeRatesCacheEntry {
  readonly rates: Record<string, number>;
  readonly providerUpdatedAt: number | null;
}

/**
 * Minimal key/value store with TTL. Implemented in-memory for the
 * frontends and backed by Redis in `api-worker` (`createCache`).
 */
export interface ExchangeRatesStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface LoadExchangeRatesOptions {
  readonly baseCurrency: string;
  readonly store: ExchangeRatesStore;
  readonly fetchRates: (baseCurrency: string) => Promise<ExchangeRatesCacheEntry>;
  /** TTL of the fresh cache (fast path). */
  readonly ttlSeconds: number;
  /** How long a successful response is kept for the failure fallback. */
  readonly lastKnownTtlSeconds: number;
}

export function exchangeRatesFreshKey(baseCurrency: string): string {
  return `rates:${baseCurrency}`;
}

/** Last successful response, persisted SEPARATELY from the fresh cache. */
export function exchangeRatesLastKnownKey(baseCurrency: string): string {
  return `rates:last:${baseCurrency}`;
}

function isRateMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const values = Object.values(value as Record<string, unknown>);
  return (
    values.length > 0 &&
    values.every((rate) => typeof rate === "number" && Number.isFinite(rate))
  );
}

/**
 * Accepts both the current entry shape and the legacy plain rate map
 * (deployments may still hold `rates:{base}` written by the old provider).
 */
function toCacheEntry(value: unknown): ExchangeRatesCacheEntry | null {
  if (isRateMap(value)) {
    return { rates: value, providerUpdatedAt: null };
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ExchangeRatesCacheEntry>;
  if (!isRateMap(candidate.rates)) return null;
  return {
    rates: candidate.rates,
    providerUpdatedAt:
      typeof candidate.providerUpdatedAt === "number"
        ? candidate.providerUpdatedAt
        : null,
  };
}

function toSnapshot(
  baseCurrency: string,
  entry: ExchangeRatesCacheEntry,
  stale: boolean,
): ExchangeRateSnapshot {
  return {
    baseCurrency,
    rates: entry.rates,
    stale,
    providerUpdatedAt: entry.providerUpdatedAt,
  };
}

/**
 * Fresh cache → provider → last-known (failure path only).
 *
 * - Fresh hit: returned as-is (fast path, no provider call).
 * - Provider OK: fresh + last-known are updated.
 * - Provider failure WITH a last-known entry for THIS base: returned with
 *   `stale: true` (traceable through `providerUpdatedAt`).
 * - Provider failure WITHOUT a last-known entry: the original error is thrown.
 */
export async function loadExchangeRates({
  baseCurrency,
  store,
  fetchRates,
  ttlSeconds,
  lastKnownTtlSeconds,
}: LoadExchangeRatesOptions): Promise<ExchangeRateSnapshot> {
  if (!baseCurrency?.trim()) {
    throw new Error("Exchange rates: baseCurrency is required");
  }

  const cachedFresh = toCacheEntry(
    await store.get<unknown>(exchangeRatesFreshKey(baseCurrency)),
  );
  if (cachedFresh) {
    return toSnapshot(baseCurrency, cachedFresh, false);
  }

  let fetched: ExchangeRatesCacheEntry;
  try {
    fetched = await fetchRates(baseCurrency);
    if (!isRateMap(fetched.rates)) {
      throw new Error(
        `Exchange rate provider returned no usable rates for ${baseCurrency}`,
      );
    }
  } catch (error) {
    const lastKnown = toCacheEntry(
      await store.get<unknown>(exchangeRatesLastKnownKey(baseCurrency)),
    );
    if (lastKnown) {
      return toSnapshot(baseCurrency, lastKnown, true);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  await store.set(
    exchangeRatesFreshKey(baseCurrency),
    fetched,
    ttlSeconds,
  );
  await store.set(
    exchangeRatesLastKnownKey(baseCurrency),
    fetched,
    lastKnownTtlSeconds,
  );

  return toSnapshot(baseCurrency, fetched, false);
}

/**
 * In-memory store for frontend runtimes (Next server module scope and the
 * browser tab). Expired entries are dropped on read.
 */
export function createMemoryExchangeRatesStore(
  now: () => number = Date.now,
): ExchangeRatesStore {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.value as T;
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

/** Read-only view of the payment conversion block. */
export interface PaymentConversionView {
  /** True when the payment currency differs from the plan currency. */
  readonly required: boolean;
  /** `hidden` = no rate and no converted amount; `readonly` = API rate, no input. */
  readonly conversionBlock: "hidden" | "readonly";
  /** Exact API rate, or null when it could not be obtained. */
  readonly rate: number | null;
  readonly stale: boolean;
  readonly providerUpdatedAt: number | null;
  /** False until a valid rate is available (blocks the payment submit). */
  readonly canSubmit: boolean;
}

/**
 * Builds the conversion view for a payment form. The rate is NEVER assumed:
 * a missing rate leaves `rate: null` and blocks submission.
 */
export function paymentConversionView(
  planCurrency: string,
  paymentCurrency: string,
  snapshot: ExchangeRateSnapshot | null,
  status: ExchangeRateLoadStatus,
): PaymentConversionView {
  if (planCurrency === paymentCurrency) {
    return {
      required: false,
      conversionBlock: "hidden",
      rate: 1,
      stale: false,
      providerUpdatedAt: null,
      canSubmit: true,
    };
  }

  const candidate = snapshot?.rates[paymentCurrency];
  const rate =
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate > 0
      ? candidate
      : null;

  return {
    required: true,
    conversionBlock: "readonly",
    rate,
    stale: rate === null ? false : (snapshot?.stale ?? false),
    providerUpdatedAt:
      rate === null ? null : (snapshot?.providerUpdatedAt ?? null),
    canSubmit: status === "ready" && rate !== null,
  };
}

/**
 * Value persisted as `exchangeRateApplied` (a rate, as a string).
 * A cross-currency payment always carries the exact API rate — even `1`.
 */
export function exchangeRateAppliedValue(
  conversion: PaymentConversionView,
): string | undefined {
  if (!conversion.required) return undefined;
  if (conversion.rate === null) {
    throw new Error("Cannot build a payment without an exchange rate");
  }
  return String(conversion.rate);
}
