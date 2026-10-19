import { COUNTRIES } from "@workspace/shared/constants";
import type { CurrencyFormat } from "@workspace/shared";

/**
 * Currency format suggested by the country of operation.
 *
 * The console form's own option labels group the conventions as
 * "LATAM / EU (1.250,50)" vs "USA / UK (1,250.50)", and `US` is the only
 * country in `COUNTRIES` (SSOT) that follows the USA convention. The value is a
 * SUGGESTION for the operator (the select stays editable); it is never used as
 * a read-time fallback for stored organizations.
 *
 * @returns `null` for an unknown/absent country: no suggestion, the required
 * select stays empty and blocks the submit instead of inventing a format.
 */
export function currencyFormatForCountry(
  countryCode?: string | null,
): CurrencyFormat | null {
  const country = countryCode ? COUNTRIES[countryCode] : undefined;
  if (!country) return null;
  return country.code === "US" ? "usa" : "latam";
}
