/**
 * Explicit compensation for a creation whose receipt emission failed.
 * Born in the panel creation flow, reused by the 4 SaaS flows.
 *
 * Without interactive transactions (Neon HTTP driver): the service commits
 * in 3 steps (`subsRepo.create` → `paymentsRepo.create` → step 1) and compensates
 * in the `catch` block delegating here. The decision is **by re-reading**, never by
 * error type: if the receipt number was persisted, creation is committed
 * (`'committed'`); if not, the payment is voided or the orphan subscription is cancelled
 * (`'compensated'` + service re-throws original error for `onError` to format code).
 *
 * Free of concrete repo dependencies (via closures only): caller connects
 * `paymentsRepo.findById` / `paymentsRepo.updateStatus` / `subsRepo.cancel`.
 */
export type CompensationOutcome = 'committed' | 'compensated' | 'unresolved';

export interface CompensationClosures {
  readPayment: () => Promise<{ receiptNumber?: string | null } | undefined | null>;
  voidPayment: () => Promise<unknown>;
  cancelParent?: () => Promise<unknown>;
  /**
   * Reverts an already-persisted effect of the failed attempt (e.g. extended
   * `currentPeriodEnd` in SaaS). Runs only when payment voiding was **effective**,
   * never on `'committed'` (if receipt was issued, creation is valid) nor on
   * `'unresolved'`. If voiding fails, payment remains valid and effect must be preserved:
   * reverting period would leave a charge without service (Rule 4).
   */
  revertEffect?: () => Promise<unknown>;
}

export interface CompensationOptions {
  paymentCreated: boolean;
}

/**
 * Fixed reason for compensatory voiding. Persisted in `voided_by`/`void_reason`
 * of the payment: payment becomes `voided` — grants no access, does not count as revenue,
 * and **does not block retry** (guard only blocks `processing`).
 */
export const COMPENSATION_VOID_REASON = 'Compensación: fallo al emitir el comprobante';

/**
 * Bounded re-read attempts. A Neon HTTP driver blip is transient: a few
 * short attempts avoid deciding over a failed read.
 */
const READ_ATTEMPTS = 3;
const READ_BACKOFF_MS = [50, 150];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPaymentWithRetry(
  readPayment: CompensationClosures['readPayment'],
): Promise<{ receiptNumber?: string | null } | undefined | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    try {
      return await readPayment();
    } catch (error) {
      lastError = error;
      if (attempt < READ_ATTEMPTS - 1) await sleep(READ_BACKOFF_MS[attempt] ?? 150);
    }
  }
  throw lastError;
}

export async function compensateFailedEmission(
  originalError: unknown,
  closures: CompensationClosures,
  opts: CompensationOptions,
): Promise<CompensationOutcome> {
  if (opts.paymentCreated) {
    let persisted: { receiptNumber?: string | null } | undefined | null = null;
    try {
      persisted = await readPaymentWithRetry(closures.readPayment);
    } catch (readError) {
      // Re-read failed after retries (persistent blip): cannot know whether
      // receipt number committed, and blindly voiding would destroy a legitimately
      // issued receipt (and revert SaaS period). Real fail-closed: touch nothing;
      // service re-throws original and sweep (predicate 1) recovers render if committed.
      console.error('[subscription-compensation] relectura no resuelta: no se compensa', {
        readError,
        originalError,
      });
      return 'unresolved';
    }
    if (persisted?.receiptNumber) {
      // Receipt number committed before failure (or idempotent retry completed it):
      // do not compensate or re-throw. Sweep predicate 1 recovers pending render (≤15 min).
      return 'committed';
    }
    // Voiding governs: period revert only runs if payment was effectively voided.
    const voided = await compensate(originalError, 'void', closures.voidPayment);
    if (voided) {
      await compensate(originalError, 'revert', closures.revertEffect);
    }
    return 'compensated';
  }

  // `paymentsRepo.create` failed: subscription was orphaned without payment.
  // Cancel, never delete (rule 6: immutable financial record).
  await compensate(originalError, 'cancel', closures.cancelParent);
  return 'compensated';
}

/**
 * Executes compensation without masking the original error: if the compensatory
 * write itself fails, it is logged and the service re-throws the emission error.
 *
 * Returns `true` if write executed without throwing. An absent closure returns `true`.
 * Period revert is gated by this result to avoid leaving a valid charge without service.
 */
async function compensate(
  originalError: unknown,
  action: 'void' | 'cancel' | 'revert',
  write?: () => Promise<unknown>,
): Promise<boolean> {
  if (!write) return true;
  try {
    await write();
    return true;
  } catch (compensationError) {
    const label = {
      void: 'payment voiding',
      cancel: 'orphan cancellation',
      revert: 'effect reversion',
    }[action];
    console.error(`[subscription-compensation] failed ${label}`, {
      compensationError,
      originalError,
    });
    return false;
  }
}
