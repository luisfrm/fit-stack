/**
 * Subscription period operations (cancel, extend, renew, register payment) are
 * only allowed while the subscription is not cancelled and its status is
 * `active` (there is no trial status anymore).
 */
interface SubscriptionStatusLike {
  readonly cancelledAt?: unknown;
  readonly status: string;
}

export function hasActiveSubscription(sub: SubscriptionStatusLike): boolean {
  if (sub.cancelledAt !== null && sub.cancelledAt !== undefined) return false;
  return sub.status === "active";
}
