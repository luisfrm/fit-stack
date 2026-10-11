/* ── Receipt render profiles — the single step-2 sequence ────────────────
   Both step-2 issuers (Panel gym receipts and Console platform receipts)
   run the exact same sequence: load composed rows → `voidedPdfPending` →
   early return → render PDF → `notifyGate` → `dispatchNotification` →
   result. The divergences are enumerated as tiny `RenderProfile`
   strategies: the composed rows they load, the R2 key year (panel: the
   LOCAL year of the persisted number; platform: the UTC year of
   `receiptIssuedAt` — that one is business, not drift), the key builders,
   the notify gate and the email they enqueue. Everything else lives here
   ONCE.

   No interactive transactions (Neon HTTP driver): atomicity is the single
   statement inside each repository (`WHERE ... IS NULL` gates), never a
   wrapping transaction. The PDF engine is imported lazily inside the render
   path so the workerd bundle stays lean and `api-worker` never depends on
   `pdf-lib`.
   ─────────────────────────────────────────────────────────────────────── */

import type { Db } from '@workspace/database/factory';
import {
  createReceiptsRepository,
  type ReceiptComposedData,
} from '@workspace/database/repositories/receipts';
import {
  createPlatformReceiptsRepository,
  type PlatformReceiptComposedData,
} from '@workspace/database/repositories/platform-receipts';
import {
  checklistPrePdf,
  composePanelReceipt,
  composePlatformReceipt,
  panelReceiptKey,
  panelVoidedReceiptKey,
  parsePanelReceiptNumber,
  platformReceiptKey,
  platformVoidedReceiptKey,
  type CurrencyFormat,
  type ReceiptData,
  type ReceiptRenderEvent,
} from '@workspace/shared';
import type { FitTaskEvent } from '../index';

/**
 * Bindings the shared core needs. The database is injected per profile (the
 * factories receive the per-request `Db`), so it is not part of this port.
 */
export interface RenderEnv {
  FILES_BUCKET: R2Bucket;
  TASK_QUEUE: Queue;
}

/**
 * PDF variant of a receipt. `voided` writes the artifact with the ANULADO
 * stamp (its own key, `receipt_voided_pdf_key`); the emission artifact is
 * never rewritten. Both compose from the SAME persisted state
 * (`receipt_voided`), so the stamp does not depend on what the event says.
 */
export type RenderVariant = 'emission' | 'voided';

/**
 * Payment fields the core reads. Both payment tables expose them, so the
 * panel and platform rows are structurally assignable.
 */
export interface RenderPaymentRow {
  id: number;
  receiptNumber: string | null;
  receiptPdfKey: string | null;
  receiptVoided: boolean;
  receiptVoidedPdfKey: string | null;
  receiptNotifiedAt: Date | null;
  receiptIssuedAt: Date | null;
}

/** Minimal composed shape the core needs from both issuers' rows. */
export interface RenderRows {
  payment: RenderPaymentRow;
  organization: { currencyFormat: string | null };
}

/**
 * One issuer's divergences. Every strategy is tiny on purpose: the core owns
 * the sequence, the profile only parametrizes it. Panel and Platform differ
 * in the composed rows they load, the R2 key year (local vs UTC), the key
 * builders, the notify gate and the email they enqueue — nothing else.
 */
export interface RenderProfile<TRows extends RenderRows> {
  /** Issuer label of the warning/error lines (`pago` / `pago SaaS`). */
  issuerLabel: string;
  /** Extra not-found context (panel scopes by org; platform does not). */
  notFoundContext(event: ReceiptRenderEvent): string;
  /** Loads the composed rows; `null` = not found → ack, never retry. */
  load(event: ReceiptRenderEvent): Promise<TRows | null>;
  /** Shared row mapper of the issuer (`compose*Receipt` in @workspace/shared). */
  compose(rows: TRows): ReceiptData;
  /**
   * Deterministic R2 key for the variant. The year derivation is issuer
   * business: panel parses the LOCAL year of the persisted number; platform
   * uses the UTC year of `receiptIssuedAt`.
   */
  resolveKey(
    rows: TRows,
    persistedNumber: string,
    issuedAt: Date,
    variant: RenderVariant,
  ): string;
  /** Completes the pdf key gate (`WHERE ... IS NULL`); `true` = THIS delivery completed it. */
  completePdf(rows: TRows, variant: RenderVariant, key: string): Promise<boolean>;
  /** Sets the notified mark only if empty; `true` = this delivery owns the email. */
  markNotified(orgId: string, paymentId: number): Promise<boolean>;
  /** Rolls the mark back when the enqueue fails (the caller re-throws). */
  clearNotified(orgId: string, paymentId: number): Promise<void>;
  /** Email event of the issuer (panel → member; platform → payer + owners). */
  buildEmailEvent(rows: TRows, orgId: string, paymentId: number): FitTaskEvent;
}

function renderFormat(currencyFormat: string | null | undefined): CurrencyFormat {
  // `organization.currencyFormat` is NOT NULL and only `latam|usa`.
  return currencyFormat === 'usa' ? 'usa' : 'latam';
}

/**
 * Renders, stores in R2 (idempotent overwrite of the SAME key) and completes
 * the pdf key gate. The persisted number and issue date are authoritative:
 * the caller already verified both.
 */
async function renderAndStore<TRows extends RenderRows>(
  profile: RenderProfile<TRows>,
  env: RenderEnv,
  rows: TRows,
  persistedNumber: string,
  variant: RenderVariant = 'emission',
): Promise<boolean> {
  const { payment } = rows;
  const issuedAt = payment.receiptIssuedAt;
  if (!issuedAt) {
    throw new Error(
      `receipt.render: ${profile.issuerLabel} ${payment.id} numerado sin fecha de emisión (invariante rota).`,
    );
  }

  const data = profile.compose(rows);
  const check = checklistPrePdf(data);
  if (!check.ok) {
    throw new Error(
      `receipt.render: checklist pre-PDF falló para ${profile.issuerLabel} ${payment.id}: ${check.errors.join(' | ')}`,
    );
  }

  const key = profile.resolveKey(rows, persistedNumber, issuedAt, variant);
  // Lazy: PDF engine only loaded during PDF render path, never in emails/sweep.
  const { renderReceiptPdfBytes } = await import('../receipt-pdf');
  const bytes = await renderReceiptPdfBytes(
    data,
    renderFormat(rows.organization.currencyFormat),
  );

  await env.FILES_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  return profile.completePdf(rows, variant, key);
}

/**
 * Notification: own gate. The winner sends; if the enqueue fails, clear the
 * mark and re-throw so the queue retries (the email is never lost).
 */
async function dispatchNotification<TRows extends RenderRows>(
  profile: RenderProfile<TRows>,
  env: RenderEnv,
  rows: TRows,
  orgId: string,
  paymentId: number,
): Promise<boolean> {
  const notifyGate = await profile.markNotified(orgId, paymentId);
  if (!notifyGate) {
    return false;
  }

  try {
    await env.TASK_QUEUE.send(profile.buildEmailEvent(rows, orgId, paymentId));
    return true;
  } catch (err) {
    await profile.clearNotified(orgId, paymentId);
    throw err;
  }
}

/**
 * Step 2 core (consumer of `fit-receipt-events`): load → `voidedPdfPending` →
 * early return → render PDF → `notifyGate` → `dispatchNotification` →
 * result. Duplicate deliveries do not re-render or re-send; the caller picks
 * the issuer profile by `event.scope`.
 */
export async function renderReceipt<TRows extends RenderRows>(
  profile: RenderProfile<TRows>,
  env: RenderEnv,
  event: ReceiptRenderEvent,
): Promise<'completed' | 'already-done'> {
  const { organizationId: orgId, paymentId } = event;
  const composed = await profile.load(event);
  if (!composed) {
    console.warn(
      `receipt.render: ${profile.issuerLabel} ${paymentId} no encontrado${profile.notFoundContext(event)}, ack.`,
    );
    return 'already-done';
  }
  const { payment } = composed;
  // A voided receipt is normally already notified, so the mark cannot close
  // the step: what is missing is the sealed PDF — real pending work, not a
  // duplicate.
  const voidedPdfPending = payment.receiptVoided && !payment.receiptVoidedPdfKey;
  // Already notified: work finished (avoids re-render and re-send).
  if (payment.receiptNotifiedAt && !voidedPdfPending) {
    return 'already-done';
  }
  const persistedNumber = payment.receiptNumber;
  if (!persistedNumber) {
    console.warn(
      `receipt.render: ${profile.issuerLabel} ${paymentId} sin número persistido, ack.`,
    );
    return 'already-done';
  }
  if (persistedNumber !== event.receiptNumber) {
    console.warn(
      `receipt.render: número del evento (${event.receiptNumber}) ≠ persistido (${persistedNumber}); se usa el persistido.`,
    );
  }

  let didWork = false;

  // ANULADO: own artifact and terminal. It never notifies (the valid receipt
  // was already sent) and its only deliverable is this PDF.
  if (payment.receiptVoided) {
    if (!payment.receiptVoidedPdfKey) {
      const rendered = await renderAndStore(profile, env, composed, persistedNumber, 'voided');
      didWork = rendered || didWork;
    }
    return didWork ? 'completed' : 'already-done';
  }

  // PDF: only if it doesn't already exist (UPDATE gate prevents race conditions).
  if (!payment.receiptPdfKey) {
    const rendered = await renderAndStore(profile, env, composed, persistedNumber);
    didWork = rendered || didWork;
  }

  const notified = await dispatchNotification(profile, env, composed, orgId, paymentId);
  if (notified) {
    didWork = true;
  }

  return didWork ? 'completed' : 'already-done';
}

/* ── Panel profile (issuer: the gym organization) ─────────────────────── */

/**
 * Key inputs of the panel issuer: the org slug + the LOCAL year parsed from
 * the persisted number (never the issue timestamp).
 */
function panelKeyInputs(
  rows: ReceiptComposedData,
  persistedNumber: string,
): { slug: string; year: number } {
  const { slug } = rows.organization;
  const year = parsePanelReceiptNumber(persistedNumber)?.year;
  if (!slug || !year) {
    throw new Error(`receipt.render: no se pudo derivar slug/año para ${persistedNumber}.`);
  }
  return { slug, year };
}

/**
 * Panel render profile (the gym organization): composed rows scoped by org,
 * R2 key year parsed from the number, member email. Exported for the issuer
 * selection in `receipt.handler`.
 */
export function createPanelRenderProfile(db: Db): RenderProfile<ReceiptComposedData> {
  const repo = createReceiptsRepository(db);
  const issuerLabel = 'pago';

  return {
    issuerLabel,

    notFoundContext(event) {
      return ` en org ${event.organizationId}`;
    },

    async load(event) {
      const composed = await repo.getReceiptComposedData(event.organizationId, event.paymentId);
      return composed ?? null;
    },

    compose(rows) {
      return composePanelReceipt(rows);
    },

    resolveKey(rows, persistedNumber, _issuedAt, variant) {
      const { slug, year } = panelKeyInputs(rows, persistedNumber);
      return variant === 'voided'
        ? panelVoidedReceiptKey(slug, year, persistedNumber)
        : panelReceiptKey(slug, year, persistedNumber);
    },

    async completePdf(rows, variant, key) {
      const { id } = rows.payment;
      const { completed } = variant === 'voided'
        ? await repo.completeVoidedReceiptPdf(id, rows.organization.id, key)
        : await repo.completeReceiptPdf(id, rows.organization.id, key);
      return completed;
    },

    async markNotified(orgId, paymentId) {
      return (await repo.markReceiptNotified(paymentId, orgId)).completed;
    },

    async clearNotified(orgId, paymentId) {
      await repo.clearReceiptNotified(paymentId, orgId);
    },

    buildEmailEvent(_rows, orgId, paymentId) {
      return { type: 'email.payment_receipt', paymentId, organizationId: orgId };
    },
  };
}

/* ── Platform profile (issuer: FitStack, SaaS) ─────────────────────────── */

/** Payer of a SaaS payment, trimmed; `payerEmail` null = owners only. */
function platformPayer(rows: PlatformReceiptComposedData): {
  payerEmail: string | null;
  payerName: string;
} {
  return {
    payerEmail: rows.payment.payerEmail?.trim() || null,
    payerName: rows.payment.payerName?.trim() || '',
  };
}

/** Org payment email event: payer included only when persisted. */
function platformEmailEvent(
  paymentId: number,
  orgId: string,
  payerEmail: string | null,
  payerName: string,
): FitTaskEvent {
  return {
    type: 'email.org_payment_received',
    paymentId,
    organizationId: orgId,
    ...(payerEmail ? { payerEmail, payerName } : {}),
  };
}

/**
 * Platform render profile (FitStack, SaaS): composed rows keyed by payment
 * id, R2 key year in UTC (billing platform operates in UTC — AGENTS §9),
 * org payment email to the payer + owners. Exported for the issuer selection
 * in `receipt.handler`.
 */
export function createPlatformRenderProfile(
  db: Db,
): RenderProfile<PlatformReceiptComposedData> {
  const repo = createPlatformReceiptsRepository(db);
  const issuerLabel = 'pago SaaS';

  return {
    issuerLabel,

    notFoundContext() {
      return '';
    },

    load(event) {
      return repo.getPlatformReceiptComposedData(event.paymentId);
    },

    compose(rows) {
      return composePlatformReceipt(rows);
    },

    resolveKey(rows, persistedNumber, issuedAt, variant) {
      // Billing platform operates in UTC (AGENTS §9): the year is UTC, not local.
      const year = issuedAt.getUTCFullYear();
      return variant === 'voided'
        ? platformVoidedReceiptKey(year, persistedNumber)
        : platformReceiptKey(year, persistedNumber);
    },

    async completePdf(rows, variant, key) {
      const { id } = rows.payment;
      const { completed } = variant === 'voided'
        ? await repo.completePlatformVoidedReceiptPdf(id, key)
        : await repo.completePlatformReceiptPdf(id, key);
      return completed;
    },

    async markNotified(_orgId, paymentId) {
      return (await repo.markPlatformReceiptNotified(paymentId)).completed;
    },

    async clearNotified(_orgId, paymentId) {
      await repo.clearPlatformReceiptNotified(paymentId);
    },

    buildEmailEvent(rows, orgId, paymentId) {
      const { payerEmail, payerName } = platformPayer(rows);
      if (!payerEmail) {
        console.log(
          `receipt.render: ${issuerLabel} ${paymentId} sin payer persistido (payer-missing); se notifica solo a owners.`,
        );
      }
      return platformEmailEvent(paymentId, orgId, payerEmail, payerName);
    },
  };
}
