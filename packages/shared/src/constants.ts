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
 * Combined Role type for general utility.
 */
export type Role = GlobalRole | OrgRole;

/**
 * Payment statuses for audit and box flow.
 */
export const PAYMENT_STATUSES = {
  PROCESSING: "processing",
  VALIDATED: "validated",
  INVALID: "invalid",
  VOIDED: "voided", // Anulado por el cajero
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
 */
export const PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active",
  PAST_DUE: "past_due",
  READ_ONLY: "read_only",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
} as const;

export type PlatformSubscriptionStatus = typeof PLATFORM_SUBSCRIPTION_STATUSES[keyof typeof PLATFORM_SUBSCRIPTION_STATUSES];

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
