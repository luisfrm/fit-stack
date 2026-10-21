/**
 * Gating de acciones de billing SaaS en console por rol de plataforma.
 *
 * - `canManageBilling`: solo `owner` y `admin` pueden mutar suscripciones/pagos.
 *   `support` es solo lectura (ver detalle, ver pagos). Se deriva de la matriz
 *   de plataforma (`subscription.cancel`), no de una comparación hardcodeada.
 * - `hasActiveSubscription`: la suscripción acepta operaciones de periodo/pago
 *   solo si no está cancelada y su estado es `active` o `trial`.
 *
 * El rol se lee de `usePlatformAuth().platformRole` (rol de plataforma, nunca
 * `orgRole`).
 */
import { canPlatform } from "@workspace/shared";

export function canManageBilling(role: string | null | undefined): boolean {
  return canPlatform(role, "subscription", "cancel");
}

interface SubscriptionStatusLike {
  readonly cancelledAt?: unknown;
  readonly status: string;
}

export function hasActiveSubscription(sub: SubscriptionStatusLike): boolean {
  if (sub.cancelledAt !== null && sub.cancelledAt !== undefined) return false;
  return sub.status === "active" || sub.status === "trial";
}
