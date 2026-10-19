import type { CurrencyFormat } from "@workspace/shared";

/**
 * Organization config carried by the session (`IOrganization`). All three
 * values are NOT NULL columns in `organization`: they are never defaulted at
 * read time (AGENTS.md §9/§10).
 */
interface OrgConfigSource {
  countryCode?: string | null;
  timezone?: string | null;
  currencyFormat?: string | null;
  primaryCurrency?: string | null;
}

export interface OrgConfig {
  countryCode: string;
  timezone: string;
  currencyFormat: CurrencyFormat;
  primaryCurrency: string;
}

/** Narrows a raw `currency_format` value; `null` when it is not a known format. */
export function resolveOrgCurrencyFormat(
  org: OrgConfigSource | null | undefined,
): CurrencyFormat | null {
  const raw = org?.currencyFormat?.trim();
  return raw === "latam" || raw === "usa" ? raw : null;
}

/**
 * Resolves the REQUIRED organization config from the session.
 *
 * @throws Error naming the missing fields. Callers that render configuration
 * (e.g. the organization settings form) must show this error instead of
 * rendering invented values such as "America/Caracas" or "latam".
 */
export function requireOrgConfig(
  org: OrgConfigSource | null | undefined,
): OrgConfig {
  if (!org) {
    throw new Error(
      "No active organization: the session does not expose the organization configuration.",
    );
  }

  const countryCode = org.countryCode?.trim() ?? "";
  const timezone = org.timezone?.trim() ?? "";
  const currencyFormat = resolveOrgCurrencyFormat(org);
  const primaryCurrency = org.primaryCurrency?.trim() ?? "";

  if (!countryCode || !timezone || !currencyFormat || !primaryCurrency) {
    const missing = [
      ...(countryCode ? [] : ["countryCode"]),
      ...(timezone ? [] : ["timezone"]),
      ...(currencyFormat ? [] : ["currencyFormat"]),
      ...(primaryCurrency ? [] : ["primaryCurrency"]),
    ];
    throw new Error(
      `Organization configuration is incomplete (missing: ${missing.join(", ")}). Fix the organization before using it.`,
    );
  }

  return { countryCode, timezone, currencyFormat, primaryCurrency };
}
