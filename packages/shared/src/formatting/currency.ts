/* ── Formatting / currency — single source of truth ────────────────────
   Centralizes value conversion and formatting for the ENTIRE project
   (panel, console, jobs-worker). Consumers import from
   `@workspace/shared` — never duplicate this file in apps.
   Money convention: all money travels in INTEGER CENTS; `formatCents`
   is the only display mechanism. Manually dividing `/ 100` is prohibited.
   Supports localized format (LATAM vs USA). Pure, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

export type CurrencyFormat = "latam" | "usa";

/**
 * Reusable helper: amounts travel in cents (DB/API) and are displayed
 * in major units. Use this instead of dividing `/ 100` manually.
 */
export function formatCents(
  cents: number,
  currency: string,
  format: CurrencyFormat = "latam",
): string {
  return ValueConverter.format(cents / 100, currency, format);
}

/** Short ES date ("07 oct 2026"). Pure helper: lives here, not in components. */
export function formatShortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export class ValueConverter {
  /**
   * Formats a number as a currency string.
   * @param value   Numeric value (e.g. 1250.5)
   * @param symbol  Currency symbol or code (e.g. "USD", "$")
   * @param format  'latam' (1.250,50) or 'usa' (1,250.50)
   */
  static format(
    value: number,
    symbol: string = "",
    format: CurrencyFormat = "latam",
  ): string {
    if (value === undefined || value === null)
      return symbol ? `0.00 ${symbol}` : "0.00";

    const isLatam = format === "latam";
    const thousandSeparator = isLatam ? "." : ",";
    const decimalSeparator = isLatam ? "," : ".";

    // Round to 2 decimals
    const fixedValue = Number(value).toFixed(2);
    const [integerPart, decimalPart] = fixedValue.split(".");

    // Add thousand separators to integer part
    const formattedInteger = integerPart!.replaceAll(
      /\B(?=(\d{3})+(?!\d))/g,
      thousandSeparator,
    );

    const result = `${formattedInteger}${decimalSeparator}${decimalPart}`;

    return symbol ? `${result} ${symbol}`.trim() : result;
  }

  /**
   * Parses a formatted string back to a raw number.
   * Handles strings with thousand separators and different decimal markers.
   */
  static parse(value: string, format: CurrencyFormat = "latam"): number {
    if (!value) return 0;

    const isLatam = format === "latam";

    let cleaned = value.trim();

    if (isLatam) {
      // LATAM: 1.250,50 -> Remove dot, change comma to dot
      cleaned = cleaned.replaceAll(".", "").replace(",", ".");
    } else {
      // USA: 1,250.50 -> Remove comma
      cleaned = cleaned.replaceAll(",", "");
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Formats an integer with thousand separators only.
   * Useful for Document IDs, member counts, etc.
   */
  static formatInteger(
    value: number | string,
    format: CurrencyFormat = "latam",
  ): string {
    const num = typeof value === "string" ? Number.parseInt(value, 10) : value;
    if (Number.isNaN(num)) return String(value);

    const isLatam = format === "latam";
    const separator = isLatam ? "." : ",";

    return String(num).replaceAll(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  /**
   * Formats a date string or object to DD/MM/YYYY (LATAM) or MM/DD/YYYY (USA).
   */
  static formatDate(
    date: string | Date,
    format: CurrencyFormat = "latam",
  ): string {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return typeof date === "string" ? date : "";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return format === "latam"
      ? `${day}/${month}/${year}`
      : `${month}/${day}/${year}`;
  }

  /**
   * Returns the "pure" numeric string for input focus (standard JS decimal dot).
   * Example: 1.250,50 -> 1250.50
   */
  static toRawString(value: number): string {
    return value.toFixed(2);
  }
}
