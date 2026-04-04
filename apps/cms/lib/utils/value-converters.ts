/**
 * ValueConverter Class
 * 
 * Centralizes all value conversion and formatting logic for the CMS.
 * Supports localized currency and number formatting (LATAM vs USA).
 */

export type CurrencyFormat = 'latam' | 'usa';

export class ValueConverter {
  /**
   * Formats a number as a currency string.
   * @param value   Numeric value (e.g. 1250.5)
   * @param symbol  Currency symbol or code (e.g. "USD", "$")
   * @param format  'latam' (1.250,50) or 'usa' (1,250.50)
   */
  static format(value: number, symbol: string = "", format: CurrencyFormat = 'latam'): string {
    const isLatam = format === 'latam';
    const thousandSeparator = isLatam ? "." : ",";
    const decimalSeparator = isLatam ? "," : ".";

    // Round to 2 decimals
    const fixedValue = value.toFixed(2);
    const [integerPart, decimalPart] = fixedValue.split(".");

    // Add thousand separators to integer part
    const formattedInteger = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);

    const result = `${formattedInteger}${decimalSeparator}${decimalPart}`;

    return symbol ? `${result} ${symbol}`.trim() : result;
  }

  /**
   * Parses a formatted string back to a raw number.
   * Handles strings with thousand separators and different decimal markers.
   */
  static parse(value: string, format: CurrencyFormat = 'latam'): number {
    if (!value) return 0;

    const isLatam = format === 'latam';

    let cleaned = value.trim();

    if (isLatam) {
      // LATAM: 1.250,50 -> Remove dot, change comma to dot
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // USA: 1,250.50 -> Remove comma
      cleaned = cleaned.replace(/,/g, "");
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Formats an integer with thousand separators only.
   * Useful for Document IDs, member counts, etc.
   */
  static formatInteger(value: number | string, format: CurrencyFormat = 'latam'): string {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (isNaN(num)) return String(value);

    const isLatam = format === 'latam';
    const separator = isLatam ? "." : ",";

    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  /**
   * Returns the "pure" numeric string for input focus (standard JS decimal dot).
   * Example: 1.250,50 -> 1250.50
   */
  static toRawString(value: number): string {
    return value.toFixed(2);
  }
}
