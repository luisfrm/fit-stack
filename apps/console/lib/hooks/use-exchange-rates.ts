"use client";

import * as React from "react";
import type { ExchangeRateSnapshot } from "@workspace/shared";
import {
  getExchangeRateSnapshot,
} from "@/lib/api/exchange-rates";

/**
 * Fetches exchange rates for a base currency on the client.
 *
 * This is inherently client-side: the base currency is the plan currency the
 * user selects interactively inside the subscription form, so the request must
 * happen at runtime. Caching (fresh TTL + last-known fallback) lives in
 * `lib/api/exchange-rates.ts`, shared with RSC consumers.
 */
export function useExchangeRates(baseCurrency: string) {
  const [snapshot, setSnapshot] = React.useState<ExchangeRateSnapshot | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isError, setIsError] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!baseCurrency) {
      setSnapshot(undefined);
      setIsError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    // Never keep rates from a previous base currency during the transition.
    setSnapshot(undefined);

    getExchangeRateSnapshot(baseCurrency)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((error: unknown) => {
        console.error("[EXCHANGE RATES] Unable to load rates", error);
        if (!cancelled) setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseCurrency, reloadToken]);

  const reload = React.useCallback(() => setReloadToken((value) => value + 1), []);

  return {
    snapshot,
    data: snapshot?.rates,
    stale: snapshot?.stale ?? false,
    providerUpdatedAt: snapshot?.providerUpdatedAt ?? null,
    isLoading,
    isError,
    reload,
  };
}
