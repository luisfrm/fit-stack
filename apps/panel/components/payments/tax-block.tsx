"use client";

import { ReceiptText } from "lucide-react";
import {
  Text,
  Input,
  Textarea,
  Switch,
} from "@workspace/ui/components";
import { formatCents, type CurrencyFormat, type ITaxDetail } from "@workspace/shared";

export type TaxMode = "auto" | "override";

interface TaxBlockProps {
  readonly currencyPaid: string;
  readonly currencyFormat: CurrencyFormat;
  readonly subtotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly lines: ITaxDetail[];
  readonly mode: TaxMode;
  readonly onModeChange: (mode: TaxMode) => void;
  readonly rateOverrides: Record<string, string>;
  readonly onRateChange: (name: string, pct: string) => void;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly disabled?: boolean;
  /**
   * Declaración de contribuyente formal del emisor (`resolveFiscalProfile`).
   * `false` → el comprobante NO detalla impuestos (D1) y el ajuste manual
   * queda deshabilitado: el override solo puede reducir carga fiscal (D6).
   */
  readonly emitterIsFormal: boolean;
}

/**
 * Bloque fiscal del flujo de pago (presentacional).
 * Los números los calcula el padre con `previewReceiptTaxes` (única fuente);
 * aquí solo se muestran con `formatCents` y se editan tasas/motivo.
 */
export function TaxBlock({
  currencyPaid,
  currencyFormat,
  subtotal,
  taxTotal,
  total,
  lines,
  mode,
  onModeChange,
  rateOverrides,
  onRateChange,
  reason,
  onReasonChange,
  disabled,
  emitterIsFormal,
}: TaxBlockProps) {
  const isOverride = mode === "override";

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-primary" />
          <Text weight="bold" uppercase size="base" as="div">Impuestos</Text>
        </div>
        {emitterIsFormal && (
          <div className="flex items-center gap-2">
            <Text size="xs" variant="muted">Ajuste manual</Text>
            <Switch
              checked={isOverride}
              disabled={disabled}
              onCheckedChange={(value) => onModeChange(value ? "override" : "auto")}
              aria-label="Ajuste manual de impuestos"
            />
          </div>
        )}
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
            <div key={line.name} className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
              <div className="flex justify-between items-center gap-4">
                <Text size="sm">{line.name} ({Number((line.rate * 100).toFixed(4))}%)</Text>
                <Text size="sm" weight="bold" className="tabular-nums">
                  {formatCents(line.amount, currencyPaid, currencyFormat)}
                </Text>
              </div>
              {isOverride && (
                <Input
                  label={`Tasa ${line.name} (%)`}
                  value={rateOverrides[line.name] ?? String(Number((line.rate * 100).toFixed(4)))}
                  disabled={disabled}
                  onChange={(e) => onRateChange(line.name, e.target.value)}
                />
              )}
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

      {isOverride && (
        <div className="space-y-2">
          <Textarea
            label="Motivo del ajuste manual *"
            placeholder="Ej.: exoneración parcial autorizada por gerencia"
            value={reason}
            disabled={disabled}
            onChange={(e) => onReasonChange(e.target.value)}
          />
          <Text size="xs" variant="muted" className="italic">
            Los montos se recalculan con las tasas indicadas. Los campos con * son obligatorios.
          </Text>
        </div>
      )}
    </div>
  );
}
