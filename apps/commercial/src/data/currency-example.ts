/**
 * Worked multi-currency example shared by the hero illustration and the
 * multi-currency section, so both always show the same numbers.
 *
 * Amounts and rates come from the example in
 * `vaults/guides/knowledge-base-rag/how-works-multi-currency.md`
 * (3.000 bolívares at 36,50 and 50.000 pesos at 4.100). `baseCents` is that
 * example converted to the primary currency (USD); the table is labelled as
 * illustrative so it is never read as real revenue.
 */
import { formatCents, ValueConverter } from "@workspace/shared";

export interface CurrencyExampleRow {
  readonly id: string;
  readonly label: string;
  /** ISO code of the currency actually collected. */
  readonly currency: string;
  readonly currencyLabel: string;
  readonly amountCents: number;
  /** Payment-currency units per 1 USD, as quoted on that day. */
  readonly rate: number;
  /** Equivalent already stored with the payment, in the primary currency. */
  readonly baseCents: number;
}

const VES_ROW: CurrencyExampleRow = {
  id: "ves",
  label: "Inscripción",
  currency: "VES",
  currencyLabel: "Bolívares",
  amountCents: 300_000,
  rate: 36.5,
  baseCents: 8_219,
};

const COP_ROW: CurrencyExampleRow = {
  id: "cop",
  label: "Mensualidad",
  currency: "COP",
  currencyLabel: "Pesos colombianos",
  amountCents: 5_000_000,
  rate: 4_100,
  baseCents: 1_220,
};

export const CURRENCY_EXAMPLE_ROWS: readonly CurrencyExampleRow[] = [VES_ROW, COP_ROW];

/** First row, used by the hero illustration. */
export const CURRENCY_EXAMPLE_PRIMARY: CurrencyExampleRow = VES_ROW;

export const CURRENCY_EXAMPLE_TOTAL_CENTS = CURRENCY_EXAMPLE_ROWS.reduce(
  (total, row) => total + row.baseCents,
  0,
);

/** Display amount in its own currency, e.g. `3.000,00 VES`. */
export function formatExampleAmount(amountCents: number, currency: string): string {
  return formatCents(amountCents, currency);
}

/** Display a rate with LatAm separators, e.g. `4.100,00`. */
export function formatExampleRate(rate: number): string {
  return ValueConverter.format(rate, "", "latam");
}
