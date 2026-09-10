"use client";

import { Text } from "@workspace/ui/components";
import { formatCents, type CurrencyFormat } from "@/lib/utils/value-converters";

interface PriceCellProps {
  readonly isTrial: boolean;
  readonly priceOverride?: number | null;
  readonly planPrice?: number;
  readonly planCurrency?: string | null;
  readonly currencyFormat: CurrencyFormat;
}

export function PriceCell({
  isTrial,
  priceOverride,
  planPrice,
  planCurrency,
  currencyFormat,
}: PriceCellProps) {
  if (isTrial) {
    return (
      <Text weight="bold" size="sm" className="text-blue-400">
        Gratuito
      </Text>
    );
  }

  if (priceOverride !== null && priceOverride !== undefined) {
    const baseText =
      planPrice !== undefined
        ? formatAmount(planPrice, planCurrency ?? "USD", currencyFormat)
        : "";
    const showBase = planPrice !== undefined && priceOverride !== planPrice;

    return (
      <div className="flex flex-col gap-0.5">
        <Text weight="bold" size="sm" className="text-primary">
          {formatAmount(priceOverride, planCurrency ?? "USD", currencyFormat)}
        </Text>
        {showBase && (
          <Text
            size="xs"
            variant="muted"
            className="opacity-50 italic"
            title={`Precio base: ${baseText}`}
          >
            Base: {baseText}
          </Text>
        )}
      </div>
    );
  }

  return (
    <Text weight="bold" size="sm">
      {planPrice !== undefined
        ? formatAmount(planPrice, planCurrency ?? "USD", currencyFormat)
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
