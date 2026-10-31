/**
 * Countries where Fit-Stack is available, derived from the shared catalog
 * (`@workspace/shared` → `COUNTRIES`). Never hand-copy this list.
 */
import { COUNTRY_LIST } from "@workspace/shared";

export interface SupportedCountry {
  readonly code: string;
  readonly name: string;
  readonly flag: string;
  /** Local currency of the country; the primary currency is preselected from it. */
  readonly currency: string;
}

export const SUPPORTED_COUNTRIES: readonly SupportedCountry[] = COUNTRY_LIST.map(
  ({ code, name, flag, currency }) => ({ code, name, flag, currency }),
);
