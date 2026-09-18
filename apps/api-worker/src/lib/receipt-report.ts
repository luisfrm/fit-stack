/* ── Receipt report helpers (api-worker) ────────────────────────────────
   Mapeos puros compartidos por los DOS reportes de comprobantes (Panel y
   Console). Viven aquí para que el espejo no derive: la clasificación y los
   totales deben ser idénticos en ambos lados.
   ─────────────────────────────────────────────────────────────────────── */

import type {
  IReceiptCurrencyTotal,
  IReceiptTaxTotal,
  ITaxDetail,
} from '@workspace/shared';

/** Fila de dinero mínima que ambos reportes exponen por moneda. */
export interface ReceiptMoneyRow {
  subtotal: number | null;
  taxTotal: number | null;
  taxDetails: unknown;
  amountPaid: number;
  currencyPaid: string;
}

/**
 * Guard sobre dato persistido: `tax_details` es jsonb, así que se normaliza
 * lo que tenga la forma esperada y se descarta el resto (nunca se inventan
 * importes). Centavos enteros.
 */
export function asTaxDetails(value: unknown): ITaxDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    const l = line as { name?: unknown; rate?: unknown; amount?: unknown };
    if (typeof l.name !== 'string' || typeof l.rate !== 'number' || typeof l.amount !== 'number') {
      return [];
    }
    return [{ name: l.name, rate: l.rate, amount: l.amount }];
  });
}

/** ISO 8601 o `null`. Una fecha presente pero inválida es corrupción visible. */
export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Totales por moneda del universo emitido-no-anulado. Nunca sumas mixtas:
 * una entrada por moneda, con el desglose de impuestos por nombre.
 */
export function aggregateCurrencyTotals(rows: ReceiptMoneyRow[]): IReceiptCurrencyTotal[] {
  const byCurrency = new Map<string, IReceiptCurrencyTotal>();
  for (const row of rows) {
    const currency = row.currencyPaid;
    let bucket = byCurrency.get(currency);
    if (!bucket) {
      bucket = { currency, subtotal: 0, taxTotal: 0, amount: 0, byTax: [] };
      byCurrency.set(currency, bucket);
    }
    bucket.subtotal += Number(row.subtotal ?? 0);
    bucket.taxTotal += Number(row.taxTotal ?? 0);
    bucket.amount += Number(row.amountPaid);
    for (const line of asTaxDetails(row.taxDetails)) {
      const existing: IReceiptTaxTotal | undefined = bucket.byTax.find(
        (t) => t.name === line.name,
      );
      if (existing) existing.amount += line.amount;
      else bucket.byTax.push({ name: line.name, amount: line.amount });
    }
  }
  return [...byCurrency.values()];
}

/**
 * Clasificación del summary del reporte. ANTI-DRIFT: debe coincidir con el
 * mapeo de filas del servicio y con el filtro SQL `issued` del repositorio.
 */
export function classifyReceiptState(group: {
  voided: boolean;
  noNumber: boolean;
  noPdf: boolean;
}): 'issued' | 'pending' | 'voided' | 'pre_system' {
  if (group.voided) return 'voided';
  if (group.noNumber) return 'pre_system';
  if (group.noPdf) return 'pending';
  return 'issued';
}
