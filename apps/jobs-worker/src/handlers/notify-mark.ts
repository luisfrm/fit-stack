import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import type { FitTaskEvent } from '../index';

export interface NotifyMarkEnv {
  DATABASE_URL: string;
}

/**
 * Clears `receipt_notified_at` for a receipt email event on its final failed
 * delivery — the one whose failure dead-letters the message.
 *
 * Step 2 sets the mark BEFORE enqueuing the email and only rolls it back when
 * the enqueue itself fails. Without this cleanup, a message that dies in the
 * email handler leaves the mark set forever: the sweep's second predicate
 * (`receipt_notified_at IS NULL`) can never see the payment again and the
 * receipt email is lost (PDF rendered, no delivery, no automatic recovery).
 *
 * Best-effort by design: a failure here is logged and swallowed — it must
 * NEVER interrupt the `message.retry()` that follows, because retrying the
 * message is the stronger guarantee. Any other event type is a no-op (only
 * receipt emails carry a notified mark).
 */
export async function clearReceiptNotifiedMarkForEvent(
  env: NotifyMarkEnv,
  event: FitTaskEvent,
): Promise<void> {
  if (event.type !== 'email.payment_receipt' && event.type !== 'email.org_payment_received') {
    // Only receipt emails carry a notified mark — nothing to clear.
    return;
  }
  const { paymentId, organizationId } = event;
  try {
    const db = createDb(env.DATABASE_URL);
    if (event.type === 'email.payment_receipt') {
      await createReceiptsRepository(db).clearReceiptNotified(paymentId, organizationId);
    } else {
      await createPlatformReceiptsRepository(db).clearPlatformReceiptNotified(paymentId);
    }
    console.log(
      `[jobs-worker] receipt notified mark cleared (final delivery, message dead-lettered) — type="${event.type}" paymentId=${paymentId} org=${organizationId}`,
    );
  } catch (err) {
    // Never propagate: the caller must still call message.retry().
    console.error(
      `[jobs-worker] FAILED to clear receipt notified mark — type="${event.type}" paymentId=${paymentId} org=${organizationId}`,
      err,
    );
  }
}
