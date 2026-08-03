"use client";

import * as React from "react";
import { ofetch } from "ofetch";
import { BASE_EXCHANGE_API_URL } from "@/lib/config/constants";

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const cache = new Map<string, { rates: Record<string, number>; fetchedAt: number }>();

/**
 * Fetches exchange rates for a base currency on the client.
 *
 * This is inherently client-side: the base currency is the plan currency the
 * user selects interactively inside the subscription form, so the request must
 * happen at runtime. A tiny module-level cache (1h TTL) mirrors the old
 * TanStack staleTime without pulling in the dependency.
 */
export function useExchangeRates(baseCurrency: string) {
  const [data, setData] = React.useState<Record<string, number> | undefined>(() => {
    const hit = cache.get(baseCurrency);
    return hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS ? hit.rates : undefined;
  });
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!baseCurrency) return;

    const hit = cache.get(baseCurrency);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      setData(hit.rates);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    // Reset stale rates from the previous base currency so the consumer never
    // computes a conversion against the wrong base during the transition.
    setData(undefined);

    ofetch<ExchangeRatesResponse>(`${BASE_EXCHANGE_API_URL}/${baseCurrency}`)
      .then((res) => {
        if (cancelled) return;
        cache.set(baseCurrency, { rates: res.rates, fetchedAt: Date.now() });
        setData(res.rates);
      })
      .catch(() => {
        if (!cancelled) setData(undefined);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  return { data, isLoading };
}
