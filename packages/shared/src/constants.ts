/**
 * Organization-specific Roles (Tenant Level).
 * Defines what a user can do within a specific gym/organization.
 */
export const ORG_ROLES = {
  OWNER: "owner", // Super Admin / Creator - total control
  MANAGER: "manager", // Gym Owner/Manager - full tenant control
  CASHIER: "cashier", // Staff/Cashier - payments and check-ins
  COACH: "coach", // Trainer - routines and athlete progress
  MEMBER: "member", // Gym client - app access to their own data
} as const;

export type OrgRole = typeof ORG_ROLES[keyof typeof ORG_ROLES];

/**
 * Human-readable Spanish labels for ORGANIZATION roles (Panel / gym tenant).
 */
export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  manager: "Gerente",
  cashier: "Cajero",
  coach: "Entrenador",
  member: "Miembro",
};

/**
 * Human-readable Spanish labels for PLATFORM roles (Console / SaaS admin).
 * NOTE: `owner` also exists in ORG_ROLE_LABELS but is a DIFFERENT concept:
 * platform owner (Fit-Stack staff) vs organization owner (gym tenant).
 */
export const PLATFORM_ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  support: "Soporte",
  user: "Usuario",
};

/**
 * Formats a raw ORGANIZATION (panel) role string into a Spanish label.
 */
export function formatOrgRole(role?: string | null): string {
  if (!role) return "Sin rol";
  const normalized = role.toLowerCase();
  return ORG_ROLE_LABELS[normalized] ?? (role.charAt(0).toUpperCase() + role.slice(1));
}

/**
 * Formats a raw PLATFORM (console) role string into a Spanish label.
 */
export function formatPlatformRole(role?: string | null): string {
  if (!role) return "Sin rol";
  const normalized = role.toLowerCase();
  return PLATFORM_ROLE_LABELS[normalized] ?? (role.charAt(0).toUpperCase() + role.slice(1));
}

/**
 * Payment statuses for audit and box flow.
 */
export const PAYMENT_STATUSES = {
  PROCESSING: "processing", // payment received, awaiting review/validation
  VALIDATED: "validated", // confirmed payment
  VOIDED: "voided", // voided or rejected (see `getVoidKind`)
  REFUNDED: "refunded", // reserved (unimplemented)
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

/**
 * Payment statuses that "sustain" a paid period. `processing` and `voided`
 * do NOT qualify. Single source for SaaS status (`EXISTS(validated|refunded)`).
 */
export const QUALIFYING_PAYMENT_STATUSES = [
  PAYMENT_STATUSES.VALIDATED,
  PAYMENT_STATUSES.REFUNDED,
] as const;

export type VoidKind = "rejected" | "annulled";

/**
 * Distinguishes a rejection from a void based on the issued receipt.
 * **Not a DB state**: `voided` is the only database status; the kind is derived:
 * - without `receiptNumber` → `rejected` (never was an issued valid payment)
 * - with `receiptNumber` → `annulled` (a receipt existed and was voided)
 */
export function getVoidKind(payment: { receiptNumber?: string | null }): VoidKind {
  return payment.receiptNumber ? "annulled" : "rejected";
}

/**
 * Subscription statuses for access control.
 *
 * `CANCELLED` and `VOIDED` are NOT synonyms:
 * - `CANCELLED` = access revoked (administrative decision). The record
 *   is legitimate: billing took place and remains valid.
 * - `VOIDED` = the record is invalid: its payment was voided or rejected
 *   (`voided`; see `getVoidKind`). The receipt sequence number is never reused.
 *
 * No subscription is ever deleted: it is either voided or cancelled (aligned with
 * `PAYMENT_STATUSES.VOIDED` and the ANULADO flag on receipts).
 */
export const SUBSCRIPTION_STATUSES = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
  VOIDED: "voided",
  EXPIRED: "expired",
  EXPIRING: "expiring",
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[keyof typeof SUBSCRIPTION_STATUSES];

/**
 * Platform subscription statuses for SaaS org billing.
 * Status is computed in SQL (not persisted in DB) based on currentPeriodEnd
 * and the latest payment. We keep the constant for typing and helpers.
 */
export const PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active", // periodEnd >= now and valid payment
  PAST_DUE: "past_due", // 1-7 days overdue
  READ_ONLY: "read_only", // 8-14 days overdue
  SUSPENDED: "suspended", // 15+ days overdue
  CANCELLED: "cancelled", // cancelledAt != null
} as const;

export type PlatformSubscriptionStatus =
  typeof PLATFORM_SUBSCRIPTION_STATUSES[keyof typeof PLATFORM_SUBSCRIPTION_STATUSES];

/**
 * Grace period days for escalating a platform_subscription status.
 */
export const PLATFORM_GRACE_PERIODS = {
  PAST_DUE_DAYS: 7, // 1-7
  READ_ONLY_DAYS: 14, // 8-14
  // 15+ => suspended
} as const;

/**
 * Pure helpers to compute the status of a platform_subscription.
 * Receive raw data and return the status, without DB access.
 *
 * Single source of truth: SQL (`platform-subscriptions.repository.ts`)
 * must produce the EXACT SAME result (guaranteed by parity test).
 */
export interface IPlatformSubscriptionStatusInput {
  currentPeriodEnd: Date | string;
  cancelledAt?: Date | string | null;
  /**
   * `EXISTS(validated|refunded)` over subscription payments. `processing`
   * and `voided` do NOT qualify. NEVER use "the latest payment".
   */
  hasValidatedPayment: boolean;
  now?: Date;
}

export function computePlatformSubscriptionStatus(
  input: IPlatformSubscriptionStatusInput
): PlatformSubscriptionStatus {
  const now = input.now ?? new Date();
  const end =
    input.currentPeriodEnd instanceof Date
      ? input.currentPeriodEnd
      : new Date(input.currentPeriodEnd);

  if (input.cancelledAt) return PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED;

  if (end >= now) {
    return input.hasValidatedPayment
      ? PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE
      : PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE;
  }

  const diffMs = now.getTime() - end.getTime();
  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysOverdue <= PLATFORM_GRACE_PERIODS.PAST_DUE_DAYS) {
    return PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE;
  }
  if (daysOverdue <= PLATFORM_GRACE_PERIODS.READ_ONLY_DAYS) {
    return PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY;
  }
  return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;
}

export function isPlatformSubscriptionActive(status: PlatformSubscriptionStatus): boolean {
  return status === PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE;
}

export function isPlatformSubscriptionExpired(status: PlatformSubscriptionStatus): boolean {
  return (
    status === PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE ||
    status === PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY ||
    status === PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED
  );
}

/**
 * `max_retries` of the `fit-task-events` consumer (emails) in jobs-worker.
 *
 * Single source for the dead-letter threshold: it mirrors
 * `apps/jobs-worker/wrangler.jsonc` (root + env blocks) and
 * `infrastructure/terraform/workers.tf` (`cloudflare_queue_consumer.task`).
 * Drift between those surfaces is blocked by the parity guard
 * (`infrastructure/terraform/scripts/check-name-parity.mjs`), which asserts
 * the constant equals the consumer's `max_retries` in every block.
 */
export const TASK_QUEUE_MAX_RETRIES = 3;

/**
 * Whether the current delivery is the final one, i.e. the delivery whose
 * failure sends the message to the dead-letter queue.
 *
 * Cloudflare docs: a consumer retries delivery `max_retries` times before
 * marking the delivery as failed — the initial delivery plus `max_retries`
 * redeliveries. The delivery that dead-letters therefore carries
 * `attempts = max_retries + 1` (with 3: attempts 1, 2, 3, 4). Kept in this
 * single place so the counting can be adjusted if empirical verification
 * (dev worker + invalid SMTP credentials) ever disagrees.
 */
export function isFinalDeliveryAttempt(attempts: number, maxRetries: number): boolean {
  return attempts >= maxRetries + 1;
}

/**
 * Detailed configuration for each supported country.
 * Includes labels for identification and tax registration to avoid hardcoding.
 */

/**
 * Field type for taxForm.
 */
export type countryTax = {
  name: string;
  type: string;
  value: string;
}


export type taxType = "number" | "conditional";
/**
 * Unevaluated tax conditions, evaluated at calculation time
 * (`isTaxApplicable` in `documents/tax-math.ts`). Adding a condition means
 * adding a case there: an unknown value throws, never fails silently.
 */
export type taxCondition = "payment_currency !== 'VES'";

/** Applies when the payment is made in any currency other than VES (VE IGTF). */
export const PAYMENT_CURRENCY_NOT_VES: taxCondition = "payment_currency !== 'VES'";

export interface ICountryTax {
  name: string;
  type: taxType;
  value: string;
}

export interface ICountryTaxConditional extends ICountryTax {
  condition: taxCondition;
}

export interface ICountryConfig {
  name: string;
  code: string;
  currency: string;
  flag: string;
  timezone: string;
  docLabel: string; // e.g. "C.I.", "C.C.", "Doc. Identidad"
  taxLabel: string; // e.g. "R.I.F.", "NIT", "Registro"
  docType: string[]; // e.g. ["V", "E", "P"]
  legalDisclaimer: string[]; // e.g. ["", ""]
  countryTaxes: ICountryTax[];
  conditionalTaxes?: ICountryTaxConditional[];
}

/**
 * Global Dictionary of Countries.
 * Keyed by ISO Country Code for O(1) access.
 */
export const COUNTRIES: Record<string, ICountryConfig> = {
  VE: {
    name: "Venezuela",
    code: "VE",
    currency: "VES",
    flag: "🇻🇪",
    timezone: "America/Caracas",
    docLabel: "C.I.",
    taxLabel: "R.I.F.",
    docType: ["V", "E", "P", "J", "G"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa del SENIAT. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "16%" }
    ],
    conditionalTaxes: [
      { name: "IGTF", type: "conditional", condition: PAYMENT_CURRENCY_NOT_VES, value: "3%" }
    ]
  },
  CO: {
    name: "Colombia",
    code: "CO",
    currency: "COP",
    flag: "🇨🇴",
    timezone: "America/Bogota",
    docLabel: "C.C.",
    taxLabel: "NIT",
    docType: ["C.C.", "C.E.", "NIT", "T.I.", "PPT", "PA"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la DIAN. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "19%" }
    ]
  },
  MX: {
    name: "México",
    code: "MX",
    currency: "MXN",
    flag: "🇲🇽",
    timezone: "America/Mexico_City",
    docLabel: "CURP",
    taxLabel: "RFC",
    docType: ["CURP", "RFC"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa del SAT. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "16%" }
    ]
  },
  AR: {
    name: "Argentina",
    code: "AR",
    currency: "ARS",
    flag: "🇦🇷",
    timezone: "America/Argentina/Buenos_Aires",
    docLabel: "DNI",
    taxLabel: "CUIT",
    docType: ["DNI", "CUIT"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la AFIP. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "21%" }
    ]
  },
  PA: {
    name: "Panamá",
    code: "PA",
    currency: "PAB",
    flag: "🇵🇦",
    timezone: "America/Panama",
    docLabel: "Cédula",
    taxLabel: "RUC",
    docType: ["C.C.", "R.U.C"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la DGI. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "ITBMS", type: "number", value: "7%" }
    ]
  },
  CL: {
    name: "Chile",
    code: "CL",
    currency: "CLP",
    flag: "🇨🇱",
    timezone: "America/Santiago",
    docLabel: "RUT",
    taxLabel: "RUT",
    docType: ["RUT"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la SII. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "19%" }
    ]
  },
  PE: {
    name: "Perú",
    code: "PE",
    currency: "PEN",
    flag: "🇵🇪",
    timezone: "America/Lima",
    docLabel: "DNI",
    taxLabel: "RUC",
    docType: ["DNI", "RUC"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la SUNAT. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IGV", type: "number", value: "18%" }
    ]
  },
  ES: {
    name: "España",
    code: "ES",
    currency: "EUR",
    flag: "🇪🇸",
    timezone: "Europe/Madrid",
    docLabel: "DNI/NIE",
    taxLabel: "NIF/CIF",
    docType: ["DNI", "NIE", "NIF", "CIF"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa de la AEAT. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "21%" }
    ]
  },
  US: {
    name: "Estados Unidos",
    code: "US",
    currency: "USD",
    flag: "🇺🇸",
    timezone: "America/New_York",
    docLabel: "ID",
    taxLabel: "Tax ID",
    docType: ["ID", "Tax ID"],
    legalDisclaimer: [
      "Sales tax, if applicable, is determined by your state and is not included in this default configuration",
      "This receipt is a non-tax document and is for informational purposes only.",
      "Generated with FitStack",
    ],
    countryTaxes: []
  },
};

/**
 * Legacy array for selection components.
 */
export const COUNTRY_LIST = Object.values(COUNTRIES);

export type Country = typeof COUNTRY_LIST[number];
export const DEFAULT_COUNTRY = COUNTRIES.VE;

/**
 * Global index derived from `COUNTRIES` (single source of truth for iterations:
 * validation, selection options, labelled options). Computed once upon import.
 */
export interface CountryIndex {
  codes: string[];
  currencies: string[];
  timezones: string[];
  timezoneOptions: { value: string; label: string; countryCode: string }[];
}

export function indexCountries(countries: readonly ICountryConfig[]): CountryIndex {
  const list = [...countries];
  return {
    codes: list.map((c) => c.code),
    currencies: [...new Set(list.map((c) => c.currency))],
    timezones: [...new Set(list.map((c) => c.timezone))],
    timezoneOptions: list.map((c) => ({
      value: c.timezone,
      label: `${c.name} (${c.timezone})`,
      countryCode: c.code,
    })),
  };
}

export const COUNTRY_INDEX: CountryIndex = indexCountries(COUNTRY_LIST);
