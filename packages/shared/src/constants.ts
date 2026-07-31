/**
 * Global Platform Roles for Fit-Stack (SaaS Level).
 * Defines what a user can do across the entire platform.
 */
export const GLOBAL_ROLES = {
  ADMIN: "admin", // Global platform super-admin (e.g. Fit-Stack Owner)
  USER: "user", // Regular platform user (default)
} as const;

export type GlobalRole = typeof GLOBAL_ROLES[keyof typeof GLOBAL_ROLES];

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
 * Human-readable Spanish labels for roles.
 */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  manager: "Gerente",
  cashier: "Cajero",
  coach: "Entrenador",
  member: "Miembro",
  admin: "Administrador",
};

/**
 * Formats a raw role string into a human-readable label in Spanish.
 */
export function formatRole(role?: string | null): string {
  if (!role) return "Sin rol";
  const normalized = role.toLowerCase();
  return ROLE_LABELS[normalized] ?? (role.charAt(0).toUpperCase() + role.slice(1));
}

/**
 * Combined Role type for general utility.
 */
export type Role = GlobalRole | OrgRole;

/**
 * Payment statuses for audit and box flow.
 */
export const PAYMENT_STATUSES = {
  PENDING: "pending", // factura emitida, esperando pago
  PROCESSING: "processing", // pago recibido, esperando validación
  VALIDATED: "validated", // pago confirmado
  INVALID: "invalid", // pago rechazado
  VOIDED: "voided", // anulado por el cajero
  REFUNDED: "refunded", // reservado (no implementado)
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

/**
 * Subscription statuses for access control.
 */
export const SUBSCRIPTION_STATUSES = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
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
 */
export interface IPlatformSubscriptionStatusInput {
  currentPeriodEnd: Date | string;
  cancelledAt?: Date | string | null;
  isTrial?: boolean;
  hasValidatedPayment?: boolean;
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
  if (input.isTrial) return PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;

  if (end >= now) {
    return input.hasValidatedPayment === false
      ? PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE
      : PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE;
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
export interface ICountryConfig {
  name: string;
  code: string;
  currency: string;
  flag: string;
  timezone: string;
  docLabel: string; // e.g. "C.I.", "C.C.", "Doc. Identidad"
  taxLabel: string; // e.g. "R.I.F.", "NIT", "Registro"
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
  },
  CO: {
    name: "Colombia",
    code: "CO",
    currency: "COP",
    flag: "🇨🇴",
    timezone: "America/Bogota",
    docLabel: "C.C.",
    taxLabel: "NIT",
  },
  MX: {
    name: "México",
    code: "MX",
    currency: "MXN",
    flag: "🇲🇽",
    timezone: "America/Mexico_City",
    docLabel: "CURP",
    taxLabel: "RFC",
  },
  AR: {
    name: "Argentina",
    code: "AR",
    currency: "ARS",
    flag: "🇦🇷",
    timezone: "America/Argentina/Buenos_Aires",
    docLabel: "DNI",
    taxLabel: "CUIT",
  },
  CL: {
    name: "Chile",
    code: "CL",
    currency: "CLP",
    flag: "🇨🇱",
    timezone: "America/Santiago",
    docLabel: "RUT",
    taxLabel: "RUT",
  },
  PE: {
    name: "Perú",
    code: "PE",
    currency: "PEN",
    flag: "🇵🇪",
    timezone: "America/Lima",
    docLabel: "DNI",
    taxLabel: "RUC",
  },
  ES: {
    name: "España",
    code: "ES",
    currency: "EUR",
    flag: "🇪🇸",
    timezone: "Europe/Madrid",
    docLabel: "DNI/NIE",
    taxLabel: "NIF/CIF",
  },
  US: {
    name: "Estados Unidos",
    code: "US",
    currency: "USD",
    flag: "🇺🇸",
    timezone: "America/New_York",
    docLabel: "ID",
    taxLabel: "Tax ID",
  },
};

/**
 * Legacy array for selection components.
 */
export const COUNTRY_LIST = Object.values(COUNTRIES);

export type Country = typeof COUNTRY_LIST[number];
export const DEFAULT_COUNTRY = COUNTRIES.VE;

/** @deprecated Use COUNTRIES or COUNTRY_LIST instead */
export const LATAM_COUNTRIES = COUNTRY_LIST;
