/**
 * Global and Organization Roles for the Fit-Stack system.
 * We use string literals to seamlessly integrate with Better Auth Organizations.
 */
export const ROLES = {
  ADMIN: "admin", // Global platform admin
  MANAGER: "manager", // Gym Owner/Manager
  CASHIER: "cashier", // Staff/Cashier
  COACH: "coach", // Fitness Trainer
  MEMBER: "member", // Gym client
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

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
