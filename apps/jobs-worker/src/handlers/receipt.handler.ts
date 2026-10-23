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
 * Stale CLAIMS (claimed without number) are a fourth gap with its own query
 * (`staleClaimQuery`): the emission claims the row before consuming the
 * sequence, so a dead emission leaves no number yet.
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

export async function sweepPendingReceiptPdfs(
  env: SweepEnv,
  limit = 50,
): Promise<{ requeued: number; resumed: number }> {
  // Stale claims first: they have no number yet, so they are invisible to the
  // three pending-PDF predicates below.
  const { resumed } = await resumeClaimedReceipt(env, limit);

  const sql = neon(env.DATABASE_URL);
  const rows = (await sql.query(pendingSweepQuery('payment'), [limit])) as Array<{
    id: number;
    organization_id: string;
    receipt_number: string;
  }>;

  let requeued = 0;
  for (const row of rows) {
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
  return { requeued, resumed };
}

/**
 * Stale-claim sweep (RD-140). The emission now CLAIMS the payment before
 * consuming the sequence, so a crashed/aborted emission leaves a row with
 * `receipt_claim_at` and no number. After 15 minutes it is resumed with the
 * SAME row: the number is consumed only now, never renumbered.
 *
 * `status = 'validated'` is mandatory: an emission that failed before
 * numbering compensates the charge to `voided` (RD-155), leaving the claim
 * behind. Numbering it would create a numbered VOIDED payment, which is not a
 * legal state; that row is terminal (no number, no PDF, no email).
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
        AND p.status = 'validated'
        AND p.receipt_claim_at < now() - interval '15 minutes'
      ORDER BY p.receipt_claim_at ASC LIMIT $1`;
  }
  return `SELECT id, organization_id, receipt_claim_at
    FROM platform_subscription_payment
    WHERE receipt_claim_at IS NOT NULL AND receipt_number IS NULL
      AND status = 'validated'
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
    [limit],
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
    [limit],
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
