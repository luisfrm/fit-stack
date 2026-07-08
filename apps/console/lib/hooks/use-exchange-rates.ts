"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { BASE_EXCHANGE_API_URL } from "@/lib/config/constants";

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

export function useExchangeRates(baseCurrency: string) {
  return useQuery({
    queryKey: ["exchange-rates", baseCurrency],
    queryFn: async () => {
      const { data } = await axios.get<ExchangeRatesResponse>(
        `${BASE_EXCHANGE_API_URL}/${baseCurrency}`
      );
      return data.rates;
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    enabled: !!baseCurrency,
  });
}
