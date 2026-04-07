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
 * List of countries for internationalization (LATAM-focused).
 */
export const LATAM_COUNTRIES = [
  { name: "Venezuela", code: "VE", currency: "VES", flag: "🇻🇪" },
  { name: "Colombia", code: "CO", currency: "COP", flag: "🇨🇴" },
  { name: "México", code: "MX", currency: "MXN", flag: "🇲🇽" },
  { name: "Argentina", code: "AR", currency: "ARS", flag: "🇦🇷" },
  { name: "Chile", code: "CL", currency: "CLP", flag: "🇨🇱" },
  { name: "Perú", code: "PE", currency: "PEN", flag: "🇵🇪" },
  { name: "Ecuador", code: "EC", currency: "USD", flag: "🇪🇨" },
  { name: "Panamá", code: "PA", currency: "USD", flag: "🇵🇦" },
] as const;

export type Country = typeof LATAM_COUNTRIES[number];
