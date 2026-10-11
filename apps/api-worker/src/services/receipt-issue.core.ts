/* ── Receipt issue core — the single step-1 emission sequence ───────────
   Both step-1 orchestrators (Panel gym receipts and Console platform
   receipts) run the exact same sequence:
   load payment → validate → idempotency → fiscal work → anti-race re-read →
   consume sequence → validate number → attach → release on lost race →
   enqueue render. The divergences are enumerated as tiny `IssuerProfile`
   strategies (table/scoping, sequence source, number format, $0 skip, tax
   override, payer capture, event scope); everything else lives here ONCE.

   ⚠️ CRITICAL ORDER: fiscal profile, emitter snapshot and tax breakdown run
   BEFORE consuming the sequence (a consumed number is NEVER reused, so a
   failure there would burn a correlative), and `attach` runs BEFORE
   `release`. The unit test freezes this order against faked repositories.

   No interactive transactions (Neon HTTP driver): the atomicity of each
   write is the single statement inside the repository, never a wrapping
   transaction. No I/O here beyond the injected ports.
   ─────────────────────────────────────────────────────────────────────── */

import {
  buildReceiptRenderEvent,
  type FiscalProfile,
  type ITaxDetail,
  type ReceiptEmitterSnapshot,
  type ReceiptRenderEvent,
} from '@workspace/shared';

/**
 * Business error with HTTP status + code. Routes translate it to
 * `c.json({ error, code }, status)` — the global `onError` does not emit
 * `code`, so it is NEVER trusted for these cases (toast rule: code, not text).
 */
export class ReceiptError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 422 | 500,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Audited tax override accepted by the panel profile. Structural twin of the
 * `TaxOverrideInput` exported by `receipts.service.ts` (defined here to keep
 * the core free of service imports).
 */
export interface ReceiptIssueTaxOverride {
  subtotal: number;
  taxTotal: number;
  taxDetails: ITaxDetail[];
  taxOverrideReason: string;
}

/** Input accepted by the core; each profile reads the fields its issuer uses. */
export interface ReceiptIssueInput {
  /** Panel: organization scoping. Console: derived from the payment row. */
  orgId?: string;
  paymentId: number;
  /** Panel: org timezone (defines the local year of the sequence). */
  timezone?: string;
  /** Panel: audited tax override. Console never overrides. */
  taxOverride?: ReceiptIssueTaxOverride | null;
  /** Session actor persisted at numbering; absent → `null`, never invented. */
  actor?: string | null;
  /** Console: payer captured while `processing` if still empty. */
  payerEmail?: string | null;
  payerName?: string | null;
}

/**
 * Payment fields the core reads. Both payment tables expose them, so the
 * panel repo row and the console repo row are assignable (structural).
 */
export interface ReceiptIssuePayment {
  status?: string;
  /** Integer cents. */
  amountPaid: number;
  currencyPaid: string;
  /** Base currency frozen in the payment (NOT NULL in both tables). */
  planSnapshotCurrency: string;
  /** `null` = pre-system payment (never numbered). */
  receiptNumber?: string | null;
  receiptPdfKey?: string | null;
  organizationId: string;
}

/**
 * Organization fields the core reads. Both services look the emitter/receptor
 * up through the same `orgsRepo.findById`, so it is a core dependency.
 */
export interface ReceiptIssueOrg {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  countryCode: string;
  primaryCurrency: string;
  timezone: string;
  fiscalConfig: unknown;
}

/** Fiscal work resolved BEFORE the sequence is consumed. */
export interface ReceiptIssueFiscal {
  profile: FiscalProfile;
  subtotal: number;
  taxTotal: number;
  taxDetails: ITaxDetail[];
  taxOverrideReason: string | null;
}

/** Everything persisted together with the number in the single attach statement. */
export interface ReceiptIssueAttach {
  receiptNumber: string;
  receiptIssuedAt: Date;
  taxOverrideReason: string | null;
  subtotal: number;
  taxTotal: number;
  taxDetails: ITaxDetail[];
  emitterSnapshot: ReceiptEmitterSnapshot;
  issuedBy: string | null;
}

/** What the core reads back from the attach row (the persisted number wins). */
export interface ReceiptIssueAttached {
  receiptNumber?: string | null;
  receiptPdfKey?: string | null;
}

/**
 * Result of one emission. `skipped:true + receiptNumber:null` = no document
 * ($0 trial/free, console only): there is nothing to wait for, it is not a
 * "pending" state.
 */
export type ReceiptIssueResult =
  | { receiptNumber: null; pdfStatus: 'pending'; skipped: true }
  | { receiptNumber: string; pdfStatus: 'pending' | 'ready'; skipped: false };

/** Render queue port (Cloudflare `Queue.send` is structurally compatible). */
export interface ReceiptRenderQueue {
  send(event: ReceiptRenderEvent): Promise<unknown>;
}

/** Ports the core orchestrates itself: identical for every issuer. */
export interface ReceiptIssueDeps {
  orgsRepo: {
    findById(id: string): Promise<ReceiptIssueOrg | undefined>;
  };
  queue: ReceiptRenderQueue;
}

/**
 * One issuer's divergences. Every strategy is tiny on purpose: the core owns
 * the sequence, the profile only parametrizes it. Panel and Console differ in
 * the table/scoping, sequence source, number format, $0 skip, tax override,
 * payer capture and event scope — nothing else.
 */
export interface IssuerProfile<TYear> {
  /** Tracing namespace preserved verbatim (`receipts` / `platform-receipts`). */
  logTag: string;
  /** Prefix of the lost-race compensation error line. */
  releaseFailureLabel: string;
  /** Message of the defensive `RECEIPT_INCOHERENT` error. */
  incoherentMessage: string;
  /** Validates the input and resolves the sequence year before any I/O. */
  resolveYear(input: ReceiptIssueInput): TYear;
  /** Loads the payment scoped to the issuer's universe (also the anti-race re-read). */
  loadPayment(input: ReceiptIssueInput): Promise<ReceiptIssuePayment | null | undefined>;
  /** Organization that owns the sequence: panel input scoping / payment org. */
  resolveOrgId(payment: ReceiptIssuePayment, input: ReceiptIssueInput): string;
  /** $0 payments without document (console trial/free; panel never skips). */
  shouldSkip?(payment: ReceiptIssuePayment): boolean;
  /** Fiscal profile + tax breakdown, BEFORE consuming the sequence. */
  resolveFiscal(
    payment: ReceiptIssuePayment,
    org: ReceiptIssueOrg,
    input: ReceiptIssueInput,
  ): Promise<ReceiptIssueFiscal>;
  /** Frozen emitter identity, BEFORE consuming the sequence. */
  buildEmitterSnapshot(
    payment: ReceiptIssuePayment,
    org: ReceiptIssueOrg,
    profile: FiscalProfile,
  ): Promise<ReceiptEmitterSnapshot>;
  /** Consumes one number, formats it and self-checks it (never leaves it dangling). */
  nextNumber(
    orgId: string,
    year: TYear,
  ): Promise<{ seq: number; receiptNumber: string; coherent: boolean }>;
  /** Compensates the sequence after a lost race (never reuses a live number). */
  releaseNumber(orgId: string, year: TYear, seq: number): Promise<{ released: boolean }>;
  /** Idempotent numbering statement (`WHERE receipt_number IS NULL`). */
  attach(
    org: ReceiptIssueOrg,
    data: ReceiptIssueAttach,
    input: ReceiptIssueInput,
  ): Promise<ReceiptIssueAttached>;
  /** Console captures the payer before attaching; panel does nothing. */
  capturePayer?(input: ReceiptIssueInput): Promise<void>;
  /** Render event with the issuer's scope (panel default / platform). */
  buildRenderEvent(paymentId: number, orgId: string, receiptNumber: string): ReceiptRenderEvent;
}

/**
 * Re-queues the render if the PDF still does not exist and returns the real
 * state (`pending` when the PDF is missing). Idempotent: step 2 overwrites
 * the SAME key and its own gate decides the email.
 */
async function requeueRenderIfPdfPending<TYear>(
  profile: IssuerProfile<TYear>,
  queue: ReceiptRenderQueue,
  paymentId: number,
  orgId: string,
  receiptNumber: string,
  receiptPdfKey: string | null | undefined,
): Promise<'pending' | 'ready'> {
  if (receiptPdfKey) return 'ready';
  console.log(
    `[api-worker] ${profile.logTag}: re-queuing render — paymentId=${paymentId} receiptNumber=${receiptNumber} org=${orgId}`,
  );
  await queue.send(profile.buildRenderEvent(paymentId, orgId, receiptNumber));
  console.log(`[api-worker] ${profile.logTag}: render re-queued — paymentId=${paymentId}`);
  return 'pending';
}

/**
 * Step 1 (synchronous, no external I/O beyond DB + queue): validates, computes
 * taxes in cents, assigns the number (atomic), persists it and enqueues
 * `receipt.render`. NEVER enqueues email (step 2 does).
 */
export async function issueReceipt<TYear>(
  profile: IssuerProfile<TYear>,
  deps: ReceiptIssueDeps,
  input: ReceiptIssueInput,
): Promise<ReceiptIssueResult> {
  const { orgsRepo, queue } = deps;
  const { paymentId } = input;

  // Year first: the panel validates the org timezone here, before any I/O.
  const year = profile.resolveYear(input);

  const payment = await profile.loadPayment(input);
  if (!payment) {
    throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
  }
  if (payment.status !== 'validated') {
    throw new ReceiptError(
      409,
      'NOT_VALIDATED',
      'Solo un pago validado puede emitir comprobante.',
    );
  }

  // Trial/free $0 (console): no document, the series is not burned.
  if (profile.shouldSkip?.(payment)) {
    return { receiptNumber: null, pdfStatus: 'pending', skipped: true };
  }

  // Idempotency: already numbered → return the existing one without burning
  // the sequence.
  if (payment.receiptNumber) {
    const orgId = profile.resolveOrgId(payment, input);
    const pdfStatus = await requeueRenderIfPdfPending(
      profile,
      queue,
      paymentId,
      orgId,
      payment.receiptNumber,
      payment.receiptPdfKey,
    );
    return { receiptNumber: payment.receiptNumber, pdfStatus, skipped: false };
  }

  const orgId = profile.resolveOrgId(payment, input);
  const org = await orgsRepo.findById(orgId);
  if (!org) {
    throw new ReceiptError(404, 'ORG_NOT_FOUND', 'Organización no encontrada.');
  }

  // ⚠️ CRITICAL ORDER: the fiscal profile and the tax breakdown are resolved
  // BEFORE consuming the sequence. A consumed number is NEVER reused, so a
  // failure here (unknown country, non-integer amount) would burn a
  // correlative and leave an unexplained gap in the audit report.
  const fiscal = await profile.resolveFiscal(payment, org, input);

  // Late guard: between the payment read and this point another concurrent
  // delivery may have numbered it. Re-reading avoids consuming a number that
  // will not be persisted (race prevention, besides race compensation).
  const fresh = await profile.loadPayment(input);
  if (fresh?.receiptNumber) {
    const pdfStatus = await requeueRenderIfPdfPending(
      profile,
      queue,
      paymentId,
      orgId,
      fresh.receiptNumber,
      fresh.receiptPdfKey,
    );
    return { receiptNumber: fresh.receiptNumber, pdfStatus, skipped: false };
  }

  // Frozen emitter identity (C1): persisted together with the number in
  // `attach`, so it is built BEFORE consuming the sequence — if anything
  // throws here, no correlative is burned.
  const emitterSnapshot = await profile.buildEmitterSnapshot(payment, org, fiscal.profile);

  const { seq, receiptNumber, coherent } = await profile.nextNumber(orgId, year);
  if (!coherent) {
    // Defensive (the year is already validated): never leave the number
    // dangling.
    await profile.releaseNumber(orgId, year, seq);
    throw new ReceiptError(500, 'RECEIPT_INCOHERENT', profile.incoherentMessage);
  }

  await profile.capturePayer?.(input);

  // AUTHORITATIVE number: the one `attach` persisted (under concurrency, a
  // second request may lose the `WHERE receipt_number IS NULL` and receive
  // the existing row; the event must ALWAYS carry that number, not the local
  // one). `document_type` / `type` is always `'receipt'` — the applied label
  // is decided by the gate (`resolveDocumentLabel`), not by the caller.
  const attached = await profile.attach(
    org,
    {
      receiptNumber,
      receiptIssuedAt: new Date(),
      taxOverrideReason: fiscal.taxOverrideReason,
      subtotal: fiscal.subtotal,
      taxTotal: fiscal.taxTotal,
      taxDetails: fiscal.taxDetails,
      emitterSnapshot,
      issuedBy: input.actor ?? null,
    },
    input,
  );
  const persistedNumber = attached.receiptNumber ?? receiptNumber;

  // Lost race: another delivery already numbered the payment, this local
  // number was not persisted. Compensate the sequence if we are still the
  // last consumer; otherwise the number is irreversible and stays as a
  // audited gap.
  //
  // NOT compensating on an `attach` EXCEPTION: if the error arrived after the
  // statement committed (lost response, timeout), returning the number would
  // let it be reassigned to another payment → duplicate, which is worse than
  // a gap. Here `persistedNumber` was read from the row, so non-persistence
  // is confirmed.
  if (persistedNumber !== receiptNumber) {
    const { released } = await profile.releaseNumber(orgId, year, seq);
    if (!released) {
      console.error(
        `${profile.releaseFailureLabel}: correlativo ${receiptNumber} no persistido y no liberable (la secuencia ya avanzó).`,
      );
    }
  }

  console.log(
    `[api-worker] ${profile.logTag}: queuing render — paymentId=${paymentId} receiptNumber=${persistedNumber} org=${orgId}`,
  );
  await queue.send(profile.buildRenderEvent(paymentId, orgId, persistedNumber));
  console.log(
    `[api-worker] ${profile.logTag}: render queued — paymentId=${paymentId} receiptNumber=${persistedNumber}`,
  );
  return {
    receiptNumber: persistedNumber,
    pdfStatus: attached.receiptPdfKey ? 'ready' : 'pending',
    skipped: false,
  };
}
