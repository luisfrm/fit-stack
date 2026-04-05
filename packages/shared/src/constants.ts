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
