/**
 * Gating de acciones de billing SaaS en console por rol de plataforma.
 *
 * - `canManageBilling`: solo `owner` y `admin` pueden mutar suscripciones/pagos.
 *   `support` es solo lectura (ver detalle, ver pagos).
 * - `hasActiveSubscription`: la suscripción acepta operaciones de periodo/pago
 *   solo si no está cancelada y su estado es `active` o `trial`.
 *
 * El rol se lee de `useAuth().user.role` (rol de plataforma, no `orgRole`).
 */

export function canManageBilling(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

interface SubscriptionStatusLike {
  readonly cancelledAt?: unknown;
  readonly status: string;
}

export function hasActiveSubscription(sub: SubscriptionStatusLike): boolean {
  if (sub.cancelledAt !== null && sub.cancelledAt !== undefined) return false;
  return sub.status === "active" || sub.status === "trial";
}
