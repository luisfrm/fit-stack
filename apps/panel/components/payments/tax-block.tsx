"use client";

import { ReceiptText } from "lucide-react";
import { Text } from "@workspace/ui/components";
import { formatCents, type CurrencyFormat, type ITaxDetail } from "@workspace/shared";

interface TaxBlockProps {
  readonly currencyPaid: string;
  readonly currencyFormat: CurrencyFormat;
  readonly subtotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly lines: ITaxDetail[];
  /**
   * Formal-taxpayer declaration of the emitter (`resolveFiscalProfile`).
   * `false` → the receipt does NOT itemize taxes: only the total is recorded.
   */
  readonly emitterIsFormal: boolean;
}

/**
 * Read-only tax breakdown of the payment flow (presentational).
 * The numbers are calculated by the parent with `previewReceiptTaxes`
 * (single source of truth, same function the backend uses) and the rates come
 * from `COUNTRIES` (SSOT): nothing here is editable — there is no manual
 * override mode anymore.
 */
export function TaxBlock({
  currencyPaid,
  currencyFormat,
  subtotal,
  taxTotal,
  total,
  lines,
  emitterIsFormal,
}: TaxBlockProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <ReceiptText className="w-5 h-5 text-primary" />
        <Text weight="bold" uppercase size="base" as="div">Impuestos</Text>
      </div>

      {lines.length === 0 ? (
        <Text size="xs" variant="muted">
          {emitterIsFormal
            ? `Sin impuestos aplicables para ${currencyPaid}. Se registra únicamente el total pagado.`
            : "Tu negocio no está declarado como contribuyente formal: el comprobante registra únicamente el total pagado, sin desglose de impuestos."}
        </Text>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.name} className="flex justify-between items-center gap-4">
              <Text size="sm">{line.name} ({Number((line.rate * 100).toFixed(4))}%)</Text>
              <Text size="sm" weight="bold" className="tabular-nums">
                {formatCents(line.amount, currencyPaid, currencyFormat)}
              </Text>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center gap-4">
        <Text size="sm" variant="muted">Subtotal</Text>
        <Text size="sm" weight="bold" className="tabular-nums">
          {formatCents(subtotal, currencyPaid, currencyFormat)}
        </Text>
      </div>
      <div className="flex justify-between items-center gap-4">
        <Text size="sm" variant="muted">Impuestos</Text>
        <Text size="sm" weight="bold" className="tabular-nums">
          {formatCents(taxTotal, currencyPaid, currencyFormat)}
        </Text>
      </div>
      <div className="flex justify-between items-center gap-4">
        <Text size="sm" weight="bold">Total</Text>
        <Text size="sm" weight="bold" className="tabular-nums">
          {formatCents(total, currencyPaid, currencyFormat)}
        </Text>
      </div>
    </div>
  );
}
