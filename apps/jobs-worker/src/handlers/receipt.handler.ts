import { neon } from '@neondatabase/serverless';
import { createDb } from '@workspace/database/factory';
import {
  buildReceiptRenderEvent,
  isReceiptRenderEvent,
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
): Promise<{ requeued: number }> {
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
  return { requeued };
}
