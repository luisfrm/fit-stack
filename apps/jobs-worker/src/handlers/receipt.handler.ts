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
 * Pendientes de barrido — dos predicados, mismas columnas en las dos tablas:
 *
 * 1. **Numerado sin PDF** (≥15 min): el render se perdió. Es el caso que ya
 *    cubría el índice parcial (`idx_payment_receipt_pending` /
 *    `idx_psp_receipt_pending`).
 * 2. **PDF listo pero sin notificar** (≥30 min): el render completó y el
 *    email del paso 2 nunca salió (o su marca quedó revertida por un fallo de
 *    envío). Sin este predicado esa notificación se perdía para siempre.
 * 3. **Anulado sin PDF con sello** (≥15 min): el void se persistió y el render
 *    del artefacto ANULADO se perdió. Sin este predicado el pago quedaría
 *    anunciando un documento que ya no se sirve (fail-closed: la descarga
 *    responde `pending` en lugar del original sin sello).
 *
 * Los 30 minutos del 2.º caso son deliberados: el evento original puede
 * seguir reintentando y no queremos re-encolar en paralelo con él. Re-encolar
 * de todos modos es seguro: la notificación tiene su propio gate idempotente
 * (`markReceiptNotified` / `markPlatformReceiptNotified`), así que ni el PDF ni
 * el email se duplican.
 *
 * Query LOCAL (solo jobs-worker la usa: el paso 2 ya tiene su evento y
 * api-worker nunca barre — criterio 2-apps-idéntico). Una fila corrupta no
 * aborta el resto.
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

  // C2: mismo mecanismo para el emisor FitStack (usa el índice parcial
  // `idx_psp_receipt_pending`; el pagador se resuelve en el paso 2 desde
  // DB — el sweep no lo conoce y notifica solo a owners).
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
