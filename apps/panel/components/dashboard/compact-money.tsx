"use client";

import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import type { CurrencyFormat } from "@workspace/shared";

interface CompactMoneyProps {
  /** Amount in major units (e.g., 1250.45), already normalized to the displayed currency */
  readonly amount: number | null | undefined;
  /** Currency code or symbol (USD, VES...) — rendered in smaller size */
  readonly currency?: string;
  readonly format?: CurrencyFormat;
  /** Class to control the font size of the primary digits (default text-3xl) */
  readonly valueClassName?: string;
  readonly className?: string;
}

const SEPARATORS: Record<CurrencyFormat, { thousand: string; decimal: string }> = {
  latam: { thousand: ".", decimal: "," },
  usa: { thousand: ",", decimal: "." },
};

/**
 * Compact money display for KPIs: thousands with K / millions with M,
 * decimals and currency symbol rendered in smaller font sizes.
 *
 *   1250450 →  1.3M USD      (compact part only)
 *    12504.5 → 12.5K USD      (compact part only)
 *      450.75 → 450 .75 USD   (large integer + small cents)
 */
export function CompactMoney({
  amount,
  currency,
  format = "latam",
  valueClassName,
  className,
}: Readonly<CompactMoneyProps>) {
  const { thousand, decimal } = SEPARATORS[format];

  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return (
      <span className={cn("inline-flex items-baseline gap-1", className)}>
        <span className={cn("font-bold tracking-tight", valueClassName ?? "text-3xl")}>—</span>
        {currency && (
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{currency}</span>
        )}
      </span>
    );
  }

  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  let big: string;
  let small: string | null = null;

  if (abs >= 1_000_000) {
    big = `${sign}${(abs / 1_000_000).toFixed(1).replace(".", decimal)}M`;
  } else if (abs >= 10_000) {
    big = `${sign}${Math.round(abs / 1000)}K`;
  } else if (abs >= 1_000) {
    big = `${sign}${(abs / 1000).toFixed(1).replace(".", decimal)}K`;
  } else {
    // Small amount: large integer, small cents
    const fixed = abs.toFixed(2);
    const [intPart = "", decPart] = fixed.split(".");
    const chunks: string[] = [];
    for (let i = intPart.length; i > 0; i -= 3) {
      chunks.unshift(intPart.slice(Math.max(0, i - 3), i));
    }
    const formattedInt = chunks.join(thousand);
    big = `${sign}${formattedInt}`;
    small = `${decimal}${decPart}`;
  }

  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span className={cn("font-bold tracking-tight tabular-nums", valueClassName ?? "text-3xl")}>
        {big}
      </span>
      {small && (
        <span className="text-sm font-semibold opacity-60 tabular-nums">{small}</span>
      )}
      {currency && (
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
          {currency}
        </span>
      )}
    </span>
  );
}