import type { Db } from '@workspace/database/factory';
import {
  createReceiptsRepository,
  type AttachReceiptInput,
} from '@workspace/database/repositories/receipts';
import {
  buildEmitterSnapshot,
  buildPaymentReceiptEvent,
  buildReceiptRenderEvent,
  computeInclusiveTaxes,
  composePanelReceipt,
  formatPanelReceiptNumber,
  parsePanelReceiptNumber,
  resolveFiscalProfile,
  toLocalDayString,
  type ITaxDetail,
  type ReceiptData,
  type ReceiptDocumentType,
} from '@workspace/shared';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import {
  issueReceipt,
  ReceiptError,
  type IssuerProfile,
  type ReceiptIssueAttached,
  type ReceiptIssuePayment,
} from './receipt-issue.core';

// Preserved re-export: routes, `subscriptions.service` and `lib/errors` keep
// importing `ReceiptError` from this module.
export { ReceiptError };

export interface AssignReceiptNumberInput {
  orgId: string;
  paymentId: number;
  /** Org timezone (from `requireOrgTimezone()`): defines local year. */
  timezone: string;
  /**
   * Session actor emitting receipt. Optional in signature because sweep
   * re-enqueues without session: in that case `NULL` is persisted, never a
   * fabricated actor (only written when numbering, and sweep does not number).
   */
  actor?: string | null;
}

export type ReceiptState =
  | {
    available: true;
    pdfStatus: 'ready';
    receiptNumber: string;
    receipt: ReceiptData;
    pdfKey: string;
  }
  | { available: true; pdfStatus: 'pending'; receiptNumber: string }
  | { available: false; reason: 'pre_system' };

function receiptYear(timezone: string): number {
  // Local year of the emitter (a payment at 11pm in VE falls in the same local day/year).
  return Number(toLocalDayString(timezone, new Date()).slice(0, 4));
}

/**
 * Resolves the tax breakdown for a receipt: always computed from the
 * inclusive-tax profile (`COUNTRIES` is the tax SSOT). There is no manual
 * override path anymore — an issuer that is not a formal taxpayer gets
 * `subtotal = amountPaid`, `taxTotal = 0`, `taxDetails = []` from the profile.
 */
function resolveTaxBreakdown(
  amountPaid: number,
  profile: ReturnType<typeof resolveFiscalProfile>,
  currencyPaid: string,
): { subtotal: number; taxTotal: number; taxDetails: ITaxDetail[] } {
  // Single source of truth in shared, same as panel preview.
  const computed = computeInclusiveTaxes(amountPaid, profile.taxes, { currencyPaid });
  return {
    subtotal: computed.subtotal,
    taxTotal: computed.taxTotal,
    taxDetails: computed.taxDetails,
  };
}

/**
 * Panel repositories the issuer profile orchestrates (structural ports: the
 * unit test fakes exactly these).
 */
export interface PanelIssuerRepos {
  paymentsRepo: {
    findById(orgId: string, paymentId: number): Promise<ReceiptIssuePayment | undefined>;
  };
  receiptsRepo: {
    nextDocumentNumber(
      orgId: string,
      type: ReceiptDocumentType,
      year: number,
    ): Promise<number>;
    releaseLastNumber(
      orgId: string,
      type: ReceiptDocumentType,
      year: number,
      seq: number,
    ): Promise<{ released: boolean }>;
    attachReceipt(
      paymentId: number,
      orgId: string,
      input: AttachReceiptInput,
    ): Promise<ReceiptIssueAttached>;
  };
}

/**
 * Panel issuer profile (the gym organization): per-organization yearly
 * sequence, computed tax breakdown, no $0 skip, `panel` event scope. Exported
 * for the step-order unit test; routes only see `createReceiptsService`.
 */
export function createPanelIssuerProfile(repos: PanelIssuerRepos): IssuerProfile<number> {
  const { paymentsRepo, receiptsRepo } = repos;

  return {
    logTag: 'receipts',
    releaseFailureLabel: 'receipt emission',
    incoherentMessage: 'Número generado incoherente con el año.',

    resolveYear(input) {
      if (!input.timezone || input.timezone.trim().length === 0) {
        throw new ReceiptError(500, 'TIMEZONE_MISSING', 'Timezone de la org es obligatoria.');
      }
      const year = receiptYear(input.timezone);
      // Valid year BEFORE any I/O: an impossible format would make
      // `formatPanelReceiptNumber` throw with the number already burned.
      // Validated with seq=1 (the format does not depend on the value).
      formatPanelReceiptNumber(year, 1);
      return year;
    },

    loadPayment(input) {
      return paymentsRepo.findById(input.orgId!, input.paymentId);
    },

    resolveOrgId(_payment, input) {
      return input.orgId!;
    },

    async resolveFiscal(payment, org) {
      const profile = resolveFiscalProfile(org.countryCode, org.fiscalConfig);
      // Taxes in integer cents. amountPaid = TOTAL charged (taxes included):
      // the breakdown is always decomposed from the country tax profile.
      const { subtotal, taxTotal, taxDetails } = resolveTaxBreakdown(
        Number(payment.amountPaid),
        profile,
        payment.currencyPaid,
      );
      return { profile, subtotal, taxTotal, taxDetails };
    },

    async buildEmitterSnapshot(_payment, org, profile) {
      // Frozen emitter identity: persisted together with the number in
      // `attachReceipt`, so it is built BEFORE consuming the sequence.
      return buildEmitterSnapshot(org, profile);
    },

    async nextNumber(orgId, year) {
      const seq = await receiptsRepo.nextDocumentNumber(orgId, 'receipt', year);
      const receiptNumber = formatPanelReceiptNumber(year, seq);
      return {
        seq,
        receiptNumber,
        coherent: parsePanelReceiptNumber(receiptNumber)?.year === year,
      };
    },

    releaseNumber(orgId, year, seq) {
      return receiptsRepo.releaseLastNumber(orgId, 'receipt', year, seq);
    },

    attach(org, data, input) {
      return receiptsRepo.attachReceipt(input.paymentId, org.id, {
        receiptNumber: data.receiptNumber,
        documentType: 'receipt',
        receiptIssuedAt: data.receiptIssuedAt,
        subtotal: data.subtotal,
        taxTotal: data.taxTotal,
        taxDetails: data.taxDetails,
        emitterSnapshot: data.emitterSnapshot,
        issuedBy: data.issuedBy,
      });
    },

    buildRenderEvent(paymentId, orgId, receiptNumber) {
      return buildReceiptRenderEvent({ paymentId, organizationId: orgId, receiptNumber });
    },
  };
}

export function createReceiptsService(
  db: Db,
  receiptQueue: Queue,
  taskQueue?: Queue,
) {
  const receiptsRepo = createReceiptsRepository(db);
  const paymentsRepo = createPaymentsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);
  const profile = createPanelIssuerProfile({ paymentsRepo, receiptsRepo });

  return {
    /**
     * Step 1 (synchronous, no external I/O except DB+queue): validates, calculates
     * taxes in integer cents, assigns number (atomic), persists, and
     * enqueues `receipt.render`. NEVER enqueues email (done by step 2).
     * Shared sequence lives in `receipt-issue.core.ts`.
     */
    async assignReceiptNumber(
      input: AssignReceiptNumberInput,
    ): Promise<{ receiptNumber: string; pdfStatus: 'pending' | 'ready' }> {
      const result = await issueReceipt(profile, { orgsRepo, queue: receiptQueue }, input);
      if (result.skipped) {
        // The panel profile never skips ($0 skip is console-only): reaching
        // this branch means a broken profile, not a business state.
        throw new ReceiptError(
          500,
          'RECEIPT_INCOHERENT',
          'La emisión del panel nunca omite el número.',
        );
      }
      return { receiptNumber: result.receiptNumber, pdfStatus: result.pdfStatus };
    },

    /**
     * Receipt status for `GET /:id/receipt` contract
     * (route maps to 200/202). Never 409: historical is terminal.
     *
     * The deliverable for a VOIDED receipt is its stamped PDF: until that
     * render exists, status is `pending` and the original is **not** served
     * (fail-closed: a voided document never travels without its stamp).
     */
    async getReceiptState(orgId: string, paymentId: number): Promise<ReceiptState> {
      const composed = await receiptsRepo.getReceiptComposedData(orgId, paymentId);
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      if (!composed.payment.receiptNumber) {
        return { available: false, reason: 'pre_system' };
      }
      const deliverableKey = composed.payment.receiptVoided
        ? composed.payment.receiptVoidedPdfKey
        : composed.payment.receiptPdfKey;
      if (!deliverableKey) {
        return {
          available: true,
          pdfStatus: 'pending',
          receiptNumber: composed.payment.receiptNumber,
        };
      }
      // Compose via the shared row mapper (if the payment was numbered
      // after the snapshot migration the persisted snapshot wins; null = legacy, live compose).
      const receipt = composePanelReceipt(composed);
      return {
        available: true,
        pdfStatus: 'ready',
        receiptNumber: composed.payment.receiptNumber,
        receipt,
        pdfKey: deliverableKey,
      };
    },

    /**
     * Void with number: idempotent without overwriting audit trail;
     * without number → 409 (no receipt to void).
     *
     * Also enqueues render of VOIDED PDF (stamp is materialized by
     * step 2, gated by `receipt_voided_pdf_key`): void is not
     * complete until downloadable document reflects it.
     * If queue dispatch fails, void is ALREADY persisted and sweep
     * repairs it — original is never served while stamp is missing.
     */
    async markReceiptVoided(input: {
      orgId: string;
      paymentId: number;
      by: string;
      reason: string;
    }) {
      const composed = await receiptsRepo.getReceiptComposedData(
        input.orgId,
        input.paymentId,
      );
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      const receiptNumber = composed.payment.receiptNumber;
      if (!receiptNumber) {
        throw new ReceiptError(
          409,
          'RECEIPT_NOT_ISSUED',
          'El pago no tiene comprobante emitido.',
        );
      }

      const row = composed.payment.receiptVoided
        ? composed.payment
        : await receiptsRepo.markVoided(input.paymentId, input.orgId, {
          by: input.by,
          reason: input.reason,
        });

      // Retrying a previously applied void also repairs a lost PDF.
      if (!row.receiptVoidedPdfKey) {
        console.log(
          `[api-worker] receipts: queuing voided render — paymentId=${input.paymentId} receiptNumber=${receiptNumber}`,
        );
        await receiptQueue.send(
          buildReceiptRenderEvent({
            paymentId: input.paymentId,
            organizationId: input.orgId,
            receiptNumber,
          }),
        );
      }
      return row;
    },

    /**
     * Manual resend (4 branches): no email → 422; historical → email without
     * attachment; numbered with PDF → email; numbered without PDF → re-enqueues render
     * (idempotent) and step 2 will enqueue email upon completion.
     */
    async sendReceiptEmail(
      orgId: string,
      paymentId: number,
    ): Promise<
      | { kind: 'queued'; attachment: boolean }
      | { kind: 'pending' }
    > {
      const composed = await receiptsRepo.getReceiptComposedData(orgId, paymentId);
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      // A voided receipt is never resent: email would go out with emission
      // PDF (without stamp) or without attachment, and recipient would have
      // no way of knowing payment was voided. Its deliverable is downloading
      // the VOIDED PDF.
      if (composed.payment.receiptVoided) {
        throw new ReceiptError(
          409,
          'RECEIPT_VOIDED',
          'El comprobante está anulado: no se reenvía.',
        );
      }
      const email = composed.member?.email?.trim();
      if (!email) {
        throw new ReceiptError(
          422,
          'MEMBER_EMAIL_MISSING',
          'El miembro no tiene correo: imprima el comprobante en mostrador.',
        );
      }
      if (!taskQueue) {
        throw new ReceiptError(500, 'QUEUE_MISSING', 'Cola de emails no disponible.');
      }
      if (!composed.payment.receiptNumber) {
        console.log(`[api-worker] receipts: queuing email (no number) — paymentId=${paymentId}`);
        await taskQueue.send(
          buildPaymentReceiptEvent({
            paymentId,
            organizationId: orgId,
          }),
        );
        return { kind: 'queued', attachment: false };
      }
      if (composed.payment.receiptPdfKey) {
        console.log(`[api-worker] receipts: queuing email (with PDF) — paymentId=${paymentId}`);
        await taskQueue.send(
          buildPaymentReceiptEvent({
            paymentId,
            organizationId: orgId,
          }),
        );
        return { kind: 'queued', attachment: true };
      }
      // PDF not yet rendered — re-queue render so step 2 sends the email.
      console.log(
        `[api-worker] receipts: PDF missing, re-queuing render for email — paymentId=${paymentId} receiptNumber=${composed.payment.receiptNumber}`,
      );
      await receiptQueue.send(
        buildReceiptRenderEvent({
          paymentId,
          organizationId: orgId,
          receiptNumber: composed.payment.receiptNumber,
        }),
      );
      return { kind: 'pending' };
    },
  };
}

export type ReceiptsService = ReturnType<typeof createReceiptsService>;
