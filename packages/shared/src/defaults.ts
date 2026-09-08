/**
 * Defaults de creación (patrón `{ ...DEFAULTS, ...rest }`).
 * Los defaults de identidad viven aquí —fuente única— y se resuelven en el
 * servicio con spread, no escondidos en `.default()` de zod ni en `||`.
 * Los schemas zod los declaran `.optional()` y el servicio aplica el spread.
 */

/** Miembro de gym (`POST /api/members`). */
export const DEFAULT_MEMBER_VALUES = {
  role: 'member',
  isActive: true,
  sendInvite: false,
} as const;

/** Staff de org (`POST /api/platform/organizations/:id/staff`). */
export const DEFAULT_ORG_STAFF_VALUES = {
  role: 'owner',
  isActive: true,
  sendInvite: false,
} as const;

/** Staff de plataforma (`POST /api/platform/staff`). */
export const DEFAULT_PLATFORM_STAFF_VALUES = {
  role: 'admin',
  sendInvite: false,
} as const;
