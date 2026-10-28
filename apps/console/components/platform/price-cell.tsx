"use client";

import { Text } from "@workspace/ui/components";
import { formatCents, type CurrencyFormat } from "@workspace/shared";

interface PriceCellProps {
  readonly planPrice?: number;
  readonly planCurrency?: string | null;
  readonly currencyFormat: CurrencyFormat;
}

export function PriceCell({
  planPrice,
  planCurrency,
  currencyFormat,
}: PriceCellProps) {
  // Required display currency: a plan without one is a data error, so we show
  // an explicit empty state instead of inventing "USD" (AGENTS.md §10).
  const currency = planCurrency?.trim();
  if (!currency) {
    return (
      <Text weight="bold" size="sm">
        —
      </Text>
    );
  }

  return (
    <Text weight="bold" size="sm">
      {planPrice !== undefined
        ? formatAmount(planPrice, currency, currencyFormat)
        : "—"}
    </Text>
  );
}

function formatAmount(
  amount: number,
  currency: string,
  format: CurrencyFormat,
): string {
  return formatCents(amount, currency, format);
}
