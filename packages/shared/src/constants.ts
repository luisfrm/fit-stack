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
  PROCESSING: "processing", // pago recibido, esperando revisión/validación
  VALIDATED: "validated", // pago confirmado
  VOIDED: "voided", // anulado o rechazado (ver `getVoidKind`)
  REFUNDED: "refunded", // reservado (no implementado)
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

/**
 * Estados de pago que "sostienen" un periodo pagado. `processing` y `voided`
 * NO califican. Es la fuente única para el status SaaS (`EXISTS(validated|refunded)`).
 */
export const QUALIFYING_PAYMENT_STATUSES = [
  PAYMENT_STATUSES.VALIDATED,
  PAYMENT_STATUSES.REFUNDED,
] as const;

export type VoidKind = "rejected" | "annulled";

/**
 * Distingue un rechazo de una anulación a partir del comprobante emitido.
 * **No es un estado de DB**: `voided` es el único estado de anulación; el tipo
 * se deriva.
 * - sin `receiptNumber` → `rejected` (nunca fue un pago válido emitido)
 * - con `receiptNumber` → `annulled` (existió comprobante y se anuló)
 */
export function getVoidKind(payment: { receiptNumber?: string | null }): VoidKind {
  return payment.receiptNumber ? "annulled" : "rejected";
}

/**
 * Subscription statuses for access control.
 *
 * `CANCELLED` y `VOIDED` NO son sinónimos:
 * - `CANCELLED` = el acceso se revocó (decisión administrativa). El registro
 *   es legítimo: el cobro existió y sigue siendo válido.
 * - `VOIDED` = el registro es inválido: su cobro se anuló o se rechazó
 *   (`voided`; ver `getVoidKind`). El correlativo del comprobante no se reutiliza.
 *
 * Ninguna suscripción se elimina: se anula o se revoca (mismo vocabulario que
 * `PAYMENT_STATUSES.VOIDED` y el flag ANULADO del comprobante).
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
 * El status se computa en SQL (no se guarda en DB) según currentPeriodEnd
 * y el último pago. Mantenemos la constante para tipado y helpers.
 */
export const PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active", // periodEnd >= now y pago válido
  TRIAL: "trial", // isTrial = true
  PAST_DUE: "past_due", // 1-7 días vencida
  READ_ONLY: "read_only", // 8-14 días vencida
  SUSPENDED: "suspended", // 15+ días vencida
  CANCELLED: "cancelled", // cancelledAt != null
} as const;

export type PlatformSubscriptionStatus =
  typeof PLATFORM_SUBSCRIPTION_STATUSES[keyof typeof PLATFORM_SUBSCRIPTION_STATUSES];

/**
 * Días de gracia para escalar el status de una plataforma_subscription.
 */
export const PLATFORM_GRACE_PERIODS = {
  PAST_DUE_DAYS: 7, // 1-7
  READ_ONLY_DAYS: 14, // 8-14
  // 15+ => suspended
} as const;

/**
 * Helpers puros para computar el status de una platform_subscription.
 * Reciben los datos crudos y devuelven el status, sin acceso a DB.
 *
 * Fuente única de la regla: el SQL (`platform-subscriptions.repository.ts`)
 * debe producir el MISMO resultado (garantizado por el test de paridad).
 */
export interface IPlatformSubscriptionStatusInput {
  currentPeriodEnd: Date | string;
  cancelledAt?: Date | string | null;
  isTrial?: boolean;
  /**
   * `EXISTS(validated|refunded)` sobre los pagos de la suscripción. `processing`
   * y `voided` NO califican. NUNCA usar "el último pago".
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
  // El trial solo mantiene el status mientras su periodo está vigente.
  if (input.isTrial && end >= now) return PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;

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
  return status === PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE ||
    status === PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;
}

export function isPlatformSubscriptionExpired(status: PlatformSubscriptionStatus): boolean {
  return (
    status === PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE ||
    status === PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY ||
    status === PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED
  );
}

/**
 * Detailed configuration for each supported country.
 * Includes labels for identification and tax registration to avoid hardcoding.
 */

/**
 * Tipo de campo para el taxForm
 */
export type countryTax = {
  name: string;
  type: string;
  value: string;
}


export type taxType = "number" | "conditional";
export type taxCondition = "payment_currency !== 'VES'";

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
    docType: ["V", "E", "P"],
    legalDisclaimer: [
      "Este comprobante no constituye una factura fiscal digital conforme a la normativa del SENIAT. Es un registro interno emitido por el sistema de gestión del establecimiento.",
      "Generado con FitStack",
    ],
    countryTaxes: [
      { name: "IVA", type: "number", value: "16%" }
    ],
    conditionalTaxes: [
      { name: "IGTF", type: "conditional", condition: "payment_currency !== 'VES'", value: "3%" }
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
    docType: ["C.C.", "NIT"],
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
 * Índice global derivado de `COUNTRIES` (fuente única para recorridos:
 * validación, universos de selección, opciones con label). Se computa una
 * vez al importar. A futuro, si un país gana `timezones: string[]`, solo
 * cambia el interior (aplanado) sin romper consumidores.
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
