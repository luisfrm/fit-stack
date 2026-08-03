import { ofetch } from "ofetch";

interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

/**
 * External exchange-rates API (open.er-api.com) — NOT the Fit-Stack API,
 * so it uses plain ofetch (no session cookies, no internal baseURL).
 * `next: { revalidate }` keeps Next.js caching on RSC calls.
 */
export async function getExchangeRates(
  baseCurrency: string = "USD",
): Promise<Record<string, number>> {
  const url = `${process.env.NEXT_PUBLIC_EXCHANGE_URL ?? "https://open.er-api.com/v6/latest"}/${baseCurrency}`;
  const data = await ofetch<ExchangeRatesResponse>(url, {
    next: { revalidate: 3600 },
  });
  return data.rates;
}
