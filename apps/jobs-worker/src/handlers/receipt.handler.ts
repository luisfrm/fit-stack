import { neon } from '@neondatabase/serverless';
import { createDb } from '@workspace/database/factory';
import {
  createReceiptsRepository,
  type ReceiptComposedData,
} from '@workspace/database/repositories/receipts';
import {
  createPlatformReceiptsRepository,
  type PlatformReceiptComposedData,
  type PlatformReceiptsRepository,
} from '@workspace/database/repositories/platform-receipts';
import {
  buildPlatformReceiptDataFromComposed,
  buildReceiptDataFromComposed,
  buildReceiptRenderEvent,
  checklistPrePdf,
  isReceiptRenderEvent,
  panelReceiptKey,
  parsePanelReceiptNumber,
  platformReceiptKey,
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
  if (!isReceiptRenderEvent(event)) {
    console.warn('receipt.render: evento no soportado, ack sin procesar.');
    return 'already-done';
  }
  // C2: el emisor FitStack ramifica por `scope` (misma cola, un consumer).
  if (event.scope === 'platform') {
    return handlePlatformReceiptRender(env, event);
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

  // C2: mismo mecanismo para el emisor FitStack (usa el índice parcial
  // `idx_psp_receipt_pending`; el pagador se resuelve en el paso 2 desde
  // DB — el sweep no lo conoce y notifica solo a owners).
  const platformRows = (await sql.query(
    `SELECT id, organization_id, receipt_number FROM platform_subscription_payment
      WHERE receipt_number IS NOT NULL AND receipt_pdf_key IS NULL
        AND receipt_issued_at < now() - interval '15 minutes'
      ORDER BY receipt_issued_at ASC LIMIT $1`,
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

/* ── Emisor FitStack (Console, C2) ───────────────────────────────────── */

type PlatformReceiptsRepo = PlatformReceiptsRepository;

function buildPlatformComposeInput(
  composed: PlatformReceiptComposedData,
  persistedNumber: string,
): Parameters<typeof buildPlatformReceiptDataFromComposed>[0] {
  const { payment, subscription, organization, emitter } = composed;
  return {
    receiptNumber: persistedNumber,
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
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
      voided: payment.receiptVoided,
    },
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    receptor: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      countryCode: organization.countryCode,
      timezone: organization.timezone,
    },
    emitter: {
      legalName: emitter['fitstack_legal_name'] || null,
      taxId: emitter['fitstack_tax_id'] || null,
      address: emitter['fitstack_address'] || null,
      countryCode: emitter['fitstack_country_code'] || null,
    },
  };
}

async function renderAndStorePlatformReceiptPdf(
  env: ReceiptHandlerEnv,
  repo: PlatformReceiptsRepo,
  composed: PlatformReceiptComposedData,
  persistedNumber: string,
): Promise<boolean> {
  const { payment, organization } = composed;
  if (!payment.receiptIssuedAt) {
    throw new Error(
      `receipt.render: pago SaaS ${payment.id} numerado sin fecha de emisión (invariante rota).`,
    );
  }

  const data = buildPlatformReceiptDataFromComposed(
    buildPlatformComposeInput(composed, persistedNumber),
  );

  const check = checklistPrePdf(data);
  if (!check.ok) {
    throw new Error(
      `receipt.render: checklist pre-PDF falló para pago SaaS ${payment.id}: ${check.errors.join(' | ')}`,
    );
  }

  // Billing platform opera en UTC (AGENTS §9): el año es UTC, no local.
  const year = payment.receiptIssuedAt.getUTCFullYear();
  const key = platformReceiptKey(year, persistedNumber);
  // Lazy: PDF engine only loaded during PDF render path, never in emails/sweep.
  const { renderReceiptPdfBytes } = await import('../receipt-pdf');
  const bytes = await renderReceiptPdfBytes(
    data,
    renderFormat(organization.currencyFormat),
  );

  await env.FILES_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  const { completed } = await repo.completePlatformReceiptPdf(payment.id, key);
  return completed;
}

async function dispatchPlatformNotification(
  env: ReceiptHandlerEnv,
  repo: PlatformReceiptsRepo,
  orgId: string,
  paymentId: number,
  payer: { email?: string | null; name?: string | null },
): Promise<boolean> {
  // Notification: own gate. The winner sends; if it fails, clear and re-throw.
  const { completed: notifyGate } = await repo.markPlatformReceiptNotified(paymentId);
  if (!notifyGate) {
    return false;
  }

  const payerEmail = payer.email?.trim() || null;
  if (!payerEmail) {
    console.log(
      `receipt.render: pago SaaS ${paymentId} sin payer persistido (payer-missing); se notifica solo a owners.`,
    );
  }
  try {
    await env.TASK_QUEUE.send({
      type: 'email.org_payment_received',
      paymentId,
      organizationId: orgId,
      ...(payerEmail ? { payerEmail, payerName: payer.name?.trim() || '' } : {}),
    });
    return true;
  } catch (err) {
    await repo.clearPlatformReceiptNotified(paymentId);
    throw err;
  }
}

/**
 * Step 2 SaaS (consumer de `fit-receipt-events`, `scope:'platform'`):
 * compone vía repo shared -> fiscal shared -> render PDF -> PUT R2
 * (idempotent overwrite) -> `completePlatformReceiptPdf`. Luego notifica
 * vía email con su propio gate (`markPlatformReceiptNotified`). Duplicados
 * no re-renderizan ni re-envían.
 */
export async function handlePlatformReceiptRender(
  env: ReceiptHandlerEnv,
  event: ReceiptRenderEvent,
): Promise<'completed' | 'already-done'> {
  const { organizationId: orgId, paymentId } = event;
  const db = createDb(env.DATABASE_URL);
  const repo = createPlatformReceiptsRepository(db);

  const composed = await repo.getPlatformReceiptComposedData(paymentId);
  if (!composed) {
    console.warn(`receipt.render: pago SaaS ${paymentId} no encontrado, ack.`);
    return 'already-done';
  }
  // Already notified: work finished (avoids re-render and re-send).
  if (composed.payment.receiptNotifiedAt) {
    return 'already-done';
  }
  const persistedNumber = composed.payment.receiptNumber;
  if (!persistedNumber) {
    console.warn(`receipt.render: pago SaaS ${paymentId} sin número persistido, ack.`);
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
    const rendered = await renderAndStorePlatformReceiptPdf(env, repo, composed, persistedNumber);
    didWork = rendered || didWork;
  }

  // Notification: own gate. The winner sends; if it fails, clear and re-throw.
  const notified = await dispatchPlatformNotification(env, repo, orgId, paymentId, {
    email: composed.payment.payerEmail,
    name: composed.payment.payerName,
  });
  if (notified) {
    didWork = true;
  }

  return didWork ? 'completed' : 'already-done';
}
