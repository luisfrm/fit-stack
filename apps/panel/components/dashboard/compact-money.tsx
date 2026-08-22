"use client";

import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import type { CurrencyFormat } from "@/lib/utils/value-converters";

interface CompactMoneyProps {
  /** Monto en unidades mayores (ej. 1250.45), ya normalizado a la divisa mostrada */
  readonly amount: number | null | undefined;
  /** Código o símbolo de divisa (USD, VES...) — se muestra en tamaño reducido */
  readonly currency?: string;
  readonly format?: CurrencyFormat;
  /** Clase para controlar el tamaño del dígito principal (default text-3xl) */
  readonly valueClassName?: string;
  readonly className?: string;
}

const SEPARATORS: Record<CurrencyFormat, { thousand: string; decimal: string }> = {
  latam: { thousand: ".", decimal: "," },
  usa: { thousand: ",", decimal: "." },
};

/**
 * Monto monetario compacto para KPIs: miles con K / millones con M,
 * decimales y símbolo de divisa en tamaños menores.
 *
 *   1250450 →  1,3M USD      (solo parte compacta)
 *    12504.5 → 12,5K USD      (solo parte compacta)
 *      450.75 → 450 ,75 USD   (entero grande + decimales pequeños)
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
    // Valor chico: entero grande, centavos pequeños
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split(".");
    const formattedInt = intPart!.replaceAll(/\B(?=(\d{3})+(?!\d))/g, thousand);
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