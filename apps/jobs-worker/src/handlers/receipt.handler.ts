import { neon } from '@neondatabase/serverless';
import { createDb } from '@workspace/database/factory';
import {
  createReceiptsRepository,
  type ReceiptComposedData,
} from '@workspace/database/repositories/receipts';
import {
  buildReceiptDataFromComposed,
  buildReceiptRenderEvent,
  checklistPrePdf,
  isReceiptRenderEvent,
  panelReceiptKey,
  parsePanelReceiptNumber,
  type CurrencyFormat,
  type ReceiptRenderEvent,
} from '@workspace/shared';

export interface ReceiptHandlerEnv {
  DATABASE_URL: string;
  FILES_BUCKET: R2Bucket;
  TASK_QUEUE: Queue;
}

export interface SweepEnv {
  DATABASE_URL: string;
  RECEIPT_QUEUE: Queue;
}

type ReceiptsRepo = ReturnType<typeof createReceiptsRepository>;

function renderFormat(currencyFormat: string | null | undefined): CurrencyFormat {
  // `organization.currencyFormat` is NOT NULL and only `latam|usa`.
  return currencyFormat === 'usa' ? 'usa' : 'latam';
}

function buildComposeInput(
  composed: ReceiptComposedData,
  persistedNumber: string,
): Parameters<typeof buildReceiptDataFromComposed>[0] {
  const { payment, organization, member, subscription } = composed;
  return {
    receiptNumber: persistedNumber,
    documentType: payment.documentType === 'invoice' ? 'invoice' : 'receipt',
    issuedAt: payment.receiptIssuedAt!,
    payment: {
      id: payment.id,
      amountPaid: Number(payment.amountPaid),
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      paymentDate: payment.paymentDate,
      subtotal: payment.subtotal != null ? Number(payment.subtotal) : null,
      taxTotal: payment.taxTotal != null ? Number(payment.taxTotal) : null,
      taxDetails: payment.taxDetails,
      receiptNumber: persistedNumber,
      receiptVoided: payment.receiptVoided,
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
    },
    organization: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      address: organization.address,
      countryCode: organization.countryCode,
      primaryCurrency: organization.primaryCurrency,
      timezone: organization.timezone,
      fiscalConfig: organization.fiscalConfig,
    },
    member: member
      ? {
          firstName: member.firstName,
          lastName: member.lastName,
          documentId: member.documentId,
        }
      : null,
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          endDate: subscription.endDate,
        }
      : null,
  };
}

async function renderAndStoreReceiptPdf(
  env: ReceiptHandlerEnv,
  repo: ReceiptsRepo,
  composed: ReceiptComposedData,
  persistedNumber: string,
): Promise<boolean> {
  const { payment, organization } = composed;
  if (!payment.receiptIssuedAt) {
    throw new Error(
      `receipt.render: pago ${payment.id} numerado sin fecha de emisión (invariante rota).`,
    );
  }

  const data = buildReceiptDataFromComposed(buildComposeInput(composed, persistedNumber));

  const check = checklistPrePdf(data);
  if (!check.ok) {
    throw new Error(
      `receipt.render: checklist pre-PDF falló para pago ${payment.id}: ${check.errors.join(' | ')}`,
    );
  }

  const slug = organization.slug;
  const year = parsePanelReceiptNumber(persistedNumber)?.year;
  if (!slug || !year) {
    throw new Error(
      `receipt.render: no se pudo derivar slug/año para ${persistedNumber}.`,
    );
  }

  const key = panelReceiptKey(slug, year, persistedNumber);
  // Lazy: PDF engine only loaded during PDF render path, never in emails/sweep.
  const { renderReceiptPdfBytes } = await import('../receipt-pdf');
  const bytes = await renderReceiptPdfBytes(
    data,
    renderFormat(organization.currencyFormat),
  );

  await env.FILES_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  const { completed } = await repo.completeReceiptPdf(payment.id, organization.id, key);
  return completed;
}

async function dispatchReceiptNotification(
  env: ReceiptHandlerEnv,
  repo: ReceiptsRepo,
  orgId: string,
  paymentId: number,
): Promise<boolean> {
  // Notification: own gate. The winner sends; if it fails, clear and re-throw.
  const { completed: notifyGate } = await repo.markReceiptNotified(paymentId, orgId);
  if (!notifyGate) {
    return false;
  }

  try {
    await env.TASK_QUEUE.send({
      type: 'email.payment_receipt',
      paymentId,
      organizationId: orgId,
    });
    return true;
  } catch (err) {
    await repo.clearReceiptNotified(paymentId, orgId);
    throw err;
  }
}

/**
 * Step 2 (consumer of `fit-receipt-events`): composes via shared repo ->
 * fiscal shared -> render PDF -> PUT R2 (idempotent overwrite) ->
 * `completeReceiptPdf`. Then notifies via email with its own gate
 * (`markReceiptNotified`): if dispatch fails, clears mark and re-throws
 * so the queue retries (email is never lost). Duplicate deliveries
 * do not re-render or re-send.
 */
export async function handleReceiptRender(
  env: ReceiptHandlerEnv,
  event: ReceiptRenderEvent,
): Promise<'completed' | 'already-done'> {
  if (!isReceiptRenderEvent(event) || event.scope !== 'panel') {
    console.warn('receipt.render: evento no soportado, ack sin procesar.');
    return 'already-done';
  }
  const { organizationId: orgId, paymentId } = event;
  const db = createDb(env.DATABASE_URL);
  const repo = createReceiptsRepository(db);

  const composed = await repo.getReceiptComposedData(orgId, paymentId);
  if (!composed) {
    console.warn(`receipt.render: pago ${paymentId} no encontrado en org ${orgId}, ack.`);
    return 'already-done';
  }
  // Already notified: work finished (avoids re-render and re-send).
  if (composed.payment.receiptNotifiedAt) {
    return 'already-done';
  }
  const persistedNumber = composed.payment.receiptNumber;
  if (!persistedNumber) {
    console.warn(`receipt.render: pago ${paymentId} sin número persistido, ack.`);
    return 'already-done';
  }
  if (persistedNumber !== event.receiptNumber) {
    console.warn(
      `receipt.render: número del evento (${event.receiptNumber}) ≠ persistido (${persistedNumber}); se usa el persistido.`,
    );
  }

  let didWork = false;

  // PDF: only if it doesn't already exist (UPDATE gate prevents race conditions).
  if (!composed.payment.receiptPdfKey) {
    const rendered = await renderAndStoreReceiptPdf(env, repo, composed, persistedNumber);
    didWork = rendered || didWork;
  }

  // Notification: own gate. The winner sends; if it fails, clear and re-throw.
  const notified = await dispatchReceiptNotification(env, repo, orgId, paymentId);
  if (notified) {
    didWork = true;
  }

  return didWork ? 'completed' : 'already-done';
}

/**
 * Barrido de pendientes: re-encola renders de pagos numerados sin PDF con
 * más de 15 minutos. Query LOCAL (solo jobs-worker la usa: el paso 2 ya
 * tiene su evento y api-worker nunca barre — criterio 2-apps-idéntico).
 * Idempotente con el paso 2. Una fila corrupta no aborta el resto.
 */
export async function sweepPendingReceiptPdfs(
  env: SweepEnv,
  limit = 50,
): Promise<{ requeued: number }> {
  const sql = neon(env.DATABASE_URL);
  const rows = (await sql.query(
    `SELECT id, organization_id, receipt_number FROM payment
     WHERE receipt_number IS NOT NULL AND receipt_pdf_key IS NULL
       AND receipt_issued_at < now() - interval '15 minutes'
     ORDER BY receipt_issued_at ASC LIMIT $1`,
    [limit],
  )) as Array<{ id: number; organization_id: string; receipt_number: string }>;

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
  return { requeued };
}
