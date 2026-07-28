interface ExchangeRatesResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

export async function getExchangeRates(
  baseCurrency: string = "USD",
): Promise<Record<string, number>> {
  const url = `${process.env.NEXT_PUBLIC_EXCHANGE_URL ?? "https://open.er-api.com/v6/latest"}/${baseCurrency}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Failed to fetch exchange rates");
  const data = (await res.json()) as ExchangeRatesResponse;
  return data.rates;
}
