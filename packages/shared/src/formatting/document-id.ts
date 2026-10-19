/* ── Formatting / document-id — country-driven identification values ──────
   An identification lives in ONE string column (`gym_member.document_id`,
   `organization.tax_id`, `platform_setting.fitstack_tax_id`) in the form
   `"<type>-<number>"` (e.g. `"V-12345678"`, `"C.C.-12345678"`).
   The available `<type>` prefixes and the label shown come from `COUNTRIES`
   (SSOT): `docLabel` for a natural person (`C.I.`, `C.C.`) and `taxLabel`
   for an organization (`R.I.F.`, `NIT`). No label is ever hardcoded here.
   Pure functions, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import { COUNTRIES } from '../constants';

/** Decomposed identification: the prefix and the number, kept apart for the UI. */
export interface ParsedDocumentId {
  /** Country `docType` prefix; empty when the stored value carries none. */
  type: string;
  /** Identification number, prefix removed. */
  number: string;
}

/** Identification labels + prefixes a country defines (`COUNTRIES` = SSOT). */
export interface CountryIdentity {
  /** Label of a natural person identification (`C.I.`, `C.C.`). */
  docLabel: string;
  /** Label of an organization tax identification (`R.I.F.`, `NIT`). */
  taxLabel: string;
  /** Prefixes accepted for that country (`COUNTRIES[cc].docType`). */
  docTypes: readonly string[];
}

/**
 * Country identification config. `undefined` when the country is unknown or
 * absent: callers render an explicit empty state, never another country's
 * labels (no silent fallback).
 */
export function getCountryIdentity(
  countryCode?: string | null,
): CountryIdentity | undefined {
  if (!countryCode) return undefined;
  const country = COUNTRIES[countryCode];
  if (!country) return undefined;
  return {
    docLabel: country.docLabel,
    taxLabel: country.taxLabel,
    docTypes: country.docType,
  };
}

/**
 * Tolerant parse of a stored identification. Only a prefix present in `types`
 * is stripped, so values written before this convention existed keep working:
 * `"12345678"` (no separator) and `"12-3456789"` (hyphen inside the number,
 * or an unknown prefix) both stay whole in `number` and no prefix is invented.
 */
export function parseDocumentId(
  value: string | null | undefined,
  types: readonly string[] = [],
): ParsedDocumentId {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return { type: '', number: '' };

  const separator = raw.indexOf('-');
  if (separator <= 0) return { type: '', number: raw };

  const type = raw.slice(0, separator).trim();
  const number = raw.slice(separator + 1).trim();
  if (type.length === 0 || number.length === 0) return { type: '', number: raw };
  if (types.length === 0 || !types.includes(type)) return { type: '', number: raw };

  return { type, number };
}

/**
 * Composes the persisted form `"<type>-<number>"`. Without a number there is
 * nothing to identify: the result is `''` (the column is nullable) instead of
 * a dangling `"V-"`.
 */
export function formatDocumentId(
  type: string | null | undefined,
  number: string | null | undefined,
): string {
  const normalizedNumber = (number ?? '').trim();
  if (normalizedNumber.length === 0) return '';
  const normalizedType = (type ?? '').trim();
  if (normalizedType.length === 0) return normalizedNumber;
  return `${normalizedType}-${normalizedNumber}`;
}

/**
 * Prefix proposed for an ORGANIZATION tax identification: the country
 * `taxLabel` when it is also one of its prefixes (CO `NIT`), otherwise the
 * first defined prefix (VE, where `R.I.F.` is not a `docType`).
 */
export function defaultTaxDocumentType(
  countryCode?: string | null,
): string {
  const identity = getCountryIdentity(countryCode);
  if (!identity) return '';
  const [first] = identity.docTypes;
  if (!first) return '';
  return identity.docTypes.includes(identity.taxLabel) ? identity.taxLabel : first;
}

/**
 * Every prefix any supported country defines. A token in this set IS a
 * document type, so it must belong to the issuer's country.
 */
const ALL_KNOWN_DOC_TYPES: ReadonlySet<string> = new Set(
  Object.values(COUNTRIES).flatMap((country) => country.docType),
);

/**
 * Server-side WRITE guard for an identification (`"<type>-<number>"`): the
 * prefix must be a `docType` of the issuer's country (`COUNTRIES` = SSOT).
 * Defense-in-depth — the UI constrains the selector, the API never trusts it.
 *
 * Tolerant by design, so plain data entry is never blocked by legacy rows:
 * - empty/absent value → allowed (the column is nullable);
 * - a value identical to `currentValue` → allowed: the guard only judges what
 *   the write CHANGES, so a legacy row stays editable (e.g. toggling `isActive`
 *   on a member whose stored prefix predates the catalog);
 * - no `-` → allowed (there is no prefix to check);
 * - an UNKNOWN token → allowed: indistinguishable from a legacy value that
 *   carries a hyphen inside the number (`"12-3456789"`), which
 *   `parseDocumentId` also keeps whole instead of inventing a prefix;
 * - a token defined by ANOTHER country (e.g. `C.C.`/`NIT` on a VE issuer) →
 *   REJECTED: that is exactly the wrong-country document type;
 * - a trailing `-` with no number (`"V-"`) → REJECTED (never composed by
 *   `formatDocumentId`).
 *
 * An unknown/absent country has no catalog to enforce, so it is allowed here:
 * the fiscal layer already fails closed on issuance (`resolveFiscalProfile`).
 */
export function isDocumentIdAllowedForCountry(
  value: string | null | undefined,
  countryCode?: string | null,
  /** Value already persisted; repeating it is not a change. */
  currentValue?: string | null,
): boolean {
  const raw = (value ?? '').trim();
  if (raw.length === 0) return true;
  if (raw === (currentValue ?? '').trim()) return true;

  const separator = raw.indexOf('-');
  if (separator <= 0) return true;

  const type = raw.slice(0, separator).trim();
  const number = raw.slice(separator + 1).trim();
  if (type.length === 0) return true;
  if (number.length === 0) return false;

  const identity = getCountryIdentity(countryCode);
  if (!identity) return true;
  if (identity.docTypes.includes(type)) return true;

  return !ALL_KNOWN_DOC_TYPES.has(type);
}
