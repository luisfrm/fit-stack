/**
 * Creation defaults (pattern `{ ...DEFAULTS, ...rest }`).
 * Identity defaults live here — single source of truth — and are resolved
 * in the service with spread, not hidden in zod's `.default()` or `||`.
 * Zod schemas declare them `.optional()` and the service applies the spread.
 */

/** Gym member (`POST /api/members`). */
export const DEFAULT_MEMBER_VALUES = {
  role: 'member',
  isActive: true,
  sendInvite: false,
} as const;

/** Organization staff (`POST /api/platform/organizations/:id/staff`). */
export const DEFAULT_ORG_STAFF_VALUES = {
  role: 'owner',
  isActive: true,
  sendInvite: false,
} as const;

/** Platform staff (`POST /api/platform/staff`). */
export const DEFAULT_PLATFORM_STAFF_VALUES = {
  role: 'admin',
  sendInvite: false,
} as const;
