import { neon } from '@neondatabase/serverless';
import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import {
  buildReceiptRenderEvent,
  formatConsoleReceiptNumber,
  formatPanelReceiptNumber,
  isReceiptRenderEvent,
  toLocalDayString,
  type ReceiptRenderEvent,
} from '@workspace/shared';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';
import {
  createPanelRenderProfile,
  createPlatformRenderProfile,
  renderReceipt,
  type RenderEnv,
} from './render-profile';

export interface ReceiptHandlerEnv extends RenderEnv {
  DATABASE_URL: string;
}

export interface SweepEnv {
  DATABASE_URL: string;
  RECEIPT_QUEUE: Queue;
}

/**
 * Step 2 (consumer of `fit-receipt-events`): validates the event, picks the
 * issuer render profile by `event.scope` and runs the shared core. The whole
 * sequence (load → render → notify gate → dispatch) lives in
 * `render-profile.ts`, ONCE for both issuers.
 */
export async function handleReceiptRender(
  env: ReceiptHandlerEnv,
  event: ReceiptRenderEvent,
): Promise<'completed' | 'already-done'> {
  if (!isReceiptRenderEvent(event)) {
    console.warn('receipt.render: evento no soportado, ack sin procesar.');
    return 'already-done';
  }
  // The FitStack issuer branches by `scope` (same queue, one consumer).
  if (event.scope === 'platform') {
    return handlePlatformReceiptRender(env, event);
  }
  const db = createDb(env.DATABASE_URL);
  return renderReceipt(createPanelRenderProfile(db), env, event);
}

/**
 * Platform (FitStack issuer) entry point. Kept exported on purpose: the
 * integration suites drive the platform scope directly, without the queue.
 */
export async function handlePlatformReceiptRender(
  env: ReceiptHandlerEnv,
  event: ReceiptRenderEvent,
): Promise<'completed' | 'already-done'> {
  const db = createDb(env.DATABASE_URL);
  return renderReceipt(createPlatformRenderProfile(db), env, event);
}

/**
 * Sweep pending records — three predicates, same columns across both tables:
 *
 * 1. **Numbered without PDF** (≥15 min): render job was lost. Covered
 *    by partial index (`idx_payment_receipt_pending` / `idx_psp_receipt_pending`).
 * 2. **PDF ready but unnotified** (≥30 min): render completed but step 2
 *    email failed to send (or was cleared on delivery failure). Without this
 *    predicate the notification would be lost permanently.
 * 3. **Voided without sealed PDF** (≥15 min): void was persisted but sealed
 *    ANULADO render was lost. Without this predicate the payment would keep
 *    referencing a document that is no longer served (fail-closed).
 *
 * Two more gaps have their own queries:
 *
 * - Stale CLAIMS (claimed without number, `staleClaimQuery`): the emission
 *   claims the row before consuming the sequence, so a dead emission leaves no
 *   number yet.
 * - **Voided without the flag** (`voidedWithoutFlagQuery`): the void writes
 *   `status = PAYMENT_STATUSES.VOIDED` FIRST and `receipt_voided` second; if
 *   the second write is lost the payment is voided with `receipt_voided =
 *   false`, which every predicate below misses (they all look for the flag
 *   SET) while the panel/console contract still must not serve the emission
 *   PDF (RD-159 reads the status too). Repaired by flagging the row and
 *   enqueueing the sealed render.
 *
 * The 30-minute delay for predicate 2 is deliberate: the original event may
 * still be retrying and we avoid parallel re-queueing. Re-queueing is safe
 * regardless: notifications have their own idempotent gate
 * (`markReceiptNotified` / `markPlatformReceiptNotified`).
 *
 * LOCAL query (used only by jobs-worker: step 2 already has its event and
 * api-worker never sweeps). A corrupted row does not abort the batch.
 */
function pendingSweepQuery(table: 'payment' | 'platform_subscription_payment'): string {
  return `SELECT id, organization_id, receipt_number FROM ${table}
    WHERE receipt_number IS NOT NULL
      AND (
        (receipt_pdf_key IS NULL AND receipt_issued_at < now() - interval '15 minutes')
        OR (receipt_pdf_key IS NOT NULL AND receipt_notified_at IS NULL
            AND receipt_issued_at < now() - interval '30 minutes')
        OR (receipt_voided AND receipt_voided_pdf_key IS NULL
            AND voided_at IS NOT NULL AND voided_at < now() - interval '15 minutes')
      )
    ORDER BY receipt_issued_at ASC LIMIT $1`;
}

/**
 * Voided rows whose FLAG was never written (RD-159). The void flow writes
 * `status = voided` first and `receipt_voided` second: a failed second write
 * leaves the payment voided with the flag off, invisible to `pendingSweepQuery`
 * (which only sees the flag SET). The read contract already refuses the
 * emission PDF in that window; the sweep repairs the flag so the sealed
 * artifact is rendered and becomes the only deliverable.
 *
 * `void_reason` / `voided_at` are required because they are the proof that the
 * void itself landed (their presence is what the repair preserves as audit);
 * the 15-minute window matches the other predicates: until then the original
 * flow may still be retrying.
 *
 * LOCAL query (jobs-worker only), no partial index yet: rows in this state are
 * rare by definition (a lost write), so the scan is bounded by `LIMIT`.
 * `$2` is the voided status from `PAYMENT_STATUSES` (never a literal).
 */
function voidedWithoutFlagQuery(
  table: 'payment' | 'platform_subscription_payment',
): string {
  return `SELECT id, organization_id, receipt_number FROM ${table}
    WHERE status = $2 AND receipt_number IS NOT NULL
      AND receipt_voided = false
      AND void_reason IS NOT NULL AND voided_at IS NOT NULL
      AND voided_at < now() - interval '15 minutes'
    ORDER BY voided_at ASC LIMIT $1`;
}

interface VoidedWithoutFlagRow {
  id: number;
  organization_id: string;
  receipt_number: string;
}

/**
 * Repairs "voided without the flag" for BOTH issuers: flips `receipt_voided`
 * through the repository (single statement, audit untouched — the sweep cannot
 * invent an actor) and, only when THIS run flipped it, enqueues the sealed
 * render. A `flagged: false` means another run won the race and owns the
 * render: nothing is enqueued, so an already repaired row never duplicates.
 *
 * `repaired` counts the flags this run flipped (not the enqueues): when the
 * enqueue fails the flag is already persisted and the third pending predicate
 * recovers the render on the next run.
 */
export async function repairVoidedFlags(
  env: SweepEnv,
  limit = 50,
): Promise<{ repaired: number; repairedKeys: Set<string> }> {
  const sql = neon(env.DATABASE_URL);
  const db = createDb(env.DATABASE_URL);
  const receiptsRepo = createReceiptsRepository(db);
  const platformReceiptsRepo = createPlatformReceiptsRepository(db);
  const repairedKeys = new Set<string>();
  let repaired = 0;

  const panelRows = (await sql.query(voidedWithoutFlagQuery('payment'), [
    limit,
    PAYMENT_STATUSES.VOIDED,
  ])) as VoidedWithoutFlagRow[];

  for (const row of panelRows) {
    const paymentId = Number(row.id);
    const orgId = row.organization_id;
    let flagged = false;
    try {
      ({ flagged } = await receiptsRepo.flagVoidedIfMissing(paymentId, orgId));
    } catch (err) {
      console.error(
        `receipt sweep: fallo al reparar el flag de anulado del pago ${paymentId}:`,
        err,
      );
      continue;
    }
    if (!flagged) continue;

    repaired += 1;
    repairedKeys.add(`payment:${paymentId}`);
    try {
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          paymentId,
          organizationId: orgId,
          receiptNumber: row.receipt_number,
        }),
      );
    } catch (err) {
      // The flag is already repaired: the "voided without sealed PDF"
      // predicate re-enqueues the render on the next run.
      console.error(
        `receipt sweep: flag de anulado reparado pero fallo el re-encolado del pago ${paymentId}:`,
        err,
      );
    }
  }

  // FitStack emitter (same mechanism, no org scope on the row).
  const platformRows = (await sql.query(
    voidedWithoutFlagQuery('platform_subscription_payment'),
    [limit, PAYMENT_STATUSES.VOIDED],
  )) as VoidedWithoutFlagRow[];

  for (const row of platformRows) {
    const paymentId = Number(row.id);
    const orgId = row.organization_id;
    let flagged = false;
    try {
      ({ flagged } = await platformReceiptsRepo.flagPlatformVoidedIfMissing(paymentId));
    } catch (err) {
      console.error(
        `receipt sweep: fallo al reparar el flag de anulado del pago SaaS ${paymentId}:`,
        err,
      );
      continue;
    }
    if (!flagged) continue;

    repaired += 1;
    repairedKeys.add(`platform_subscription_payment:${paymentId}`);
    try {
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId,
          organizationId: orgId,
          receiptNumber: row.receipt_number,
        }),
      );
    } catch (err) {
      console.error(
        `receipt sweep: flag de anulado reparado pero fallo el re-encolado del pago SaaS ${paymentId}:`,
        err,
      );
    }
  }

  return { repaired, repairedKeys };
}

export interface SweepResult {
  /** Renders re-enqueued by the three pending-PDF predicates. */
  requeued: number;
  /** Stale claims numbered and re-enqueued. */
  resumed: number;
  /** Lost `receipt_voided` flags repaired (RD-159). */
  repairedVoided: number;
}

export async function sweepPendingReceiptPdfs(
  env: SweepEnv,
  limit = 50,
): Promise<SweepResult> {
  // Stale claims first: they have no number yet, so they are invisible to the
  // three pending-PDF predicates below.
  const { resumed } = await resumeClaimedReceipt(env, limit);

  // Then the voided rows whose flag was lost. Runs BEFORE the pending queries
  // on purpose: the repair flips the flag, so the render it enqueues renders
  // the sealed artifact, and without it the row matches nothing at all.
  const { repaired: repairedVoided, repairedKeys } = await repairVoidedFlags(env, limit);

  const sql = neon(env.DATABASE_URL);
  const rows = (await sql.query(pendingSweepQuery('payment'), [limit])) as Array<{
    id: number;
    organization_id: string;
    receipt_number: string;
  }>;

  let requeued = 0;
  for (const row of rows) {
    // Already re-enqueued by the flag repair of this same run (the row now
    // matches the voided predicate too): never queue it twice.
    if (repairedKeys.has(`payment:${Number(row.id)}`)) continue;
    try {
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          paymentId: Number(row.id),
          organizationId: row.organization_id,
          receiptNumber: row.receipt_number,
        }),
      );
      requeued += 1;
    } catch (err) {
      console.error(`receipt sweep: fallo al re-encolar pago ${row.id}:`, err);
    }
  }

  // Same mechanism for the FitStack emitter (uses the partial index
  // `idx_psp_receipt_pending`; payer is resolved in step 2 from
  // DB — sweep does not know payer and notifies only owners).
  const platformRows = (await sql.query(
    pendingSweepQuery('platform_subscription_payment'),
    [limit],
  )) as Array<{ id: number; organization_id: string; receipt_number: string }>;

  for (const row of platformRows) {
    if (repairedKeys.has(`platform_subscription_payment:${Number(row.id)}`)) continue;
    try {
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId: Number(row.id),
          organizationId: row.organization_id,
          receiptNumber: row.receipt_number,
        }),
      );
      requeued += 1;
    } catch (err) {
      console.error(`receipt sweep: fallo al re-encolar pago SaaS ${row.id}:`, err);
    }
  }
  return { requeued, resumed, repairedVoided };
}

/**
 * Stale-claim sweep (RD-140). The emission now CLAIMS the payment before
 * consuming the sequence, so a crashed/aborted emission leaves a row with
 * `receipt_claim_at` and no number. After 15 minutes it is resumed with the
 * SAME row: the number is consumed only now, never renumbered.
 *
 * `status = PAYMENT_STATUSES.VALIDATED` (passed as `$2`) is mandatory: an
 * emission that failed before numbering compensates the charge to `voided`
 * (RD-155), leaving the claim behind. Numbering it would create a numbered
 * VOIDED payment, which is not a legal state; that row is terminal (no number,
 * no PDF, no email).
 *
 * LOCAL query (jobs-worker only): the partial index
 * `idx_payment_receipt_claim_pending` / `idx_psp_receipt_claim_pending` covers
 * it. Panel needs the org timezone to derive the LOCAL year of the claim.
 */
function staleClaimQuery(table: 'payment' | 'platform_subscription_payment'): string {
  if (table === 'payment') {
    return `SELECT p.id, p.organization_id, p.receipt_claim_at, o.timezone
      FROM payment p
      JOIN organization o ON o.id = p.organization_id
      WHERE p.receipt_claim_at IS NOT NULL AND p.receipt_number IS NULL
        AND p.status = $2
        AND p.receipt_claim_at < now() - interval '15 minutes'
      ORDER BY p.receipt_claim_at ASC LIMIT $1`;
  }
  return `SELECT id, organization_id, receipt_claim_at
    FROM platform_subscription_payment
    WHERE receipt_claim_at IS NOT NULL AND receipt_number IS NULL
      AND status = $2
      AND receipt_claim_at < now() - interval '15 minutes'
    ORDER BY receipt_claim_at ASC LIMIT $1`;
}

interface StaleClaimRow {
  id: number;
  organization_id: string;
  receipt_claim_at: string;
}

interface StalePanelClaimRow extends StaleClaimRow {
  timezone: string;
}

/**
 * Resumes stale claims of BOTH issuers: allocates the number from the issuer's
 * sequence, attaches it to the claimed row, and enqueues `receipt.render` with
 * the persisted number. A row is never renumbered: if the attach returns a
 * different number (another delivery numbered it first) the local correlative
 * is released only when it is still the last one. If the attach returns NO
 * number (the payment left `validated` between the claim query and the attach)
 * the local correlative is released and the row is skipped: a voided payment
 * never receives a number outside its own ANULADO flow.
 */
export async function resumeClaimedReceipt(
  env: SweepEnv,
  limit = 50,
): Promise<{ resumed: number }> {
  const sql = neon(env.DATABASE_URL);
  const db = createDb(env.DATABASE_URL);
  const receiptsRepo = createReceiptsRepository(db);
  const platformReceiptsRepo = createPlatformReceiptsRepository(db);
  let resumed = 0;

  const panelRows = (await sql.query(
    staleClaimQuery('payment'),
    [limit, PAYMENT_STATUSES.VALIDATED],
  )) as StalePanelClaimRow[];

  for (const row of panelRows) {
    const paymentId = Number(row.id);
    const orgId = row.organization_id;
    try {
      // The sequence is per org/LOCAL year: the year must be the one of the
      // claim instant, never the current one.
      const claimedAt = new Date(row.receipt_claim_at);
      const year = Number(toLocalDayString(row.timezone, claimedAt).slice(0, 4));
      const seq = await receiptsRepo.nextDocumentNumber(orgId, 'receipt', year);
      const receiptNumber = formatPanelReceiptNumber(year, seq);
      const attached = await receiptsRepo.attachReceiptNumber(paymentId, orgId, {
        receiptNumber,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
      });
      // The attach only numbers `validated` rows: the payment may have been
      // voided between the claim query and the attach. No number persisted →
      // release the local correlative and skip (never number a voided row).
      if (attached.receiptNumber == null) {
        const { released } = await receiptsRepo.releaseLastNumber(
          orgId,
          'receipt',
          year,
          seq,
        );
        if (!released) {
          console.error(
            `receipt claim sweep: correlativo ${receiptNumber} no persistido y no liberable (paymentId=${paymentId}).`,
          );
        }
        console.warn(
          `receipt claim sweep: pago ${paymentId} dejó de estar validado antes del attach; se omite (correlativo ${receiptNumber} liberado=${released}).`,
        );
        continue;
      }
      const persistedNumber = attached.receiptNumber;
      if (persistedNumber !== receiptNumber) {
        const { released } = await receiptsRepo.releaseLastNumber(
          orgId,
          'receipt',
          year,
          seq,
        );
        if (!released) {
          console.error(
            `receipt claim sweep: correlativo ${receiptNumber} no persistido y no liberable (paymentId=${paymentId}).`,
          );
        }
      }
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          paymentId,
          organizationId: orgId,
          receiptNumber: persistedNumber,
        }),
      );
      resumed += 1;
    } catch (err) {
      console.error(`receipt claim sweep: fallo al reanudar pago ${paymentId}:`, err);
    }
  }

  // FitStack emitter: continuous global sequence, no year.
  const platformRows = (await sql.query(
    staleClaimQuery('platform_subscription_payment'),
    [limit, PAYMENT_STATUSES.VALIDATED],
  )) as StaleClaimRow[];

  for (const row of platformRows) {
    const paymentId = Number(row.id);
    const orgId = row.organization_id;
    try {
      const seq = await platformReceiptsRepo.nextPlatformDocumentNumber('receipt');
      const receiptNumber = formatConsoleReceiptNumber(seq);
      const attached = await platformReceiptsRepo.attachPlatformReceiptNumber(paymentId, {
        receiptNumber,
        receiptIssuedAt: new Date(),
      });
      // Same guard as the Panel issuer: no number persisted means the payment
      // left `validated` before the attach. Release and skip the render.
      if (attached.receiptNumber == null) {
        const { released } = await platformReceiptsRepo.releaseLastPlatformNumber(
          'receipt',
          seq,
        );
        if (!released) {
          console.error(
            `receipt claim sweep: correlativo ${receiptNumber} no persistido y no liberable (paymentId=${paymentId}).`,
          );
        }
        console.warn(
          `receipt claim sweep: pago SaaS ${paymentId} dejó de estar validado antes del attach; se omite (correlativo ${receiptNumber} liberado=${released}).`,
        );
        continue;
      }
      const persistedNumber = attached.receiptNumber;
      if (persistedNumber !== receiptNumber) {
        const { released } = await platformReceiptsRepo.releaseLastPlatformNumber(
          'receipt',
          seq,
        );
        if (!released) {
          console.error(
            `receipt claim sweep: correlativo ${receiptNumber} no persistido y no liberable (paymentId=${paymentId}).`,
          );
        }
      }
      await env.RECEIPT_QUEUE.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId,
          organizationId: orgId,
          receiptNumber: persistedNumber,
        }),
      );
      resumed += 1;
    } catch (err) {
      console.error(`receipt claim sweep: fallo al reanudar pago SaaS ${paymentId}:`, err);
    }
  }

  return { resumed };
}
