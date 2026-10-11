import type { Db } from '@workspace/database/factory';
import {
  createReceiptsRepository,
  type AttachReceiptInput,
} from '@workspace/database/repositories/receipts';
import {
  applyTaxOverride,
  buildEmitterSnapshot,
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

export interface TaxOverrideInput {
  subtotal: number;
  taxTotal: number;
  taxDetails: ITaxDetail[];
  taxOverrideReason: string;
}

export interface AssignReceiptNumberInput {
  orgId: string;
  paymentId: number;
  /** Zona horaria de la org (de `requireOrgTimezone()`): define el año local. */
  timezone: string;
  taxOverride?: TaxOverrideInput | null;
  /**
   * Actor de sesión que emite (C5). Opcional en la firma porque el barrido
   * re-encola sin sesión: en ese caso se persiste `NULL`, nunca un actor
   * inventado (solo se escribe al numerar, y el barrido no numera).
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
 * Resolves the tax breakdown for a receipt.
 * Either validates and applies the caller-supplied override, or
 * computes the breakdown automatically from the inclusive-tax profile.
 */
function resolveTaxBreakdown(
  amountPaid: number,
  profile: ReturnType<typeof resolveFiscalProfile>,
  currencyPaid: string,
  taxOverride?: TaxOverrideInput | null,
): { subtotal: number; taxTotal: number; taxDetails: ITaxDetail[]; taxOverrideReason: string | null } {
  if (!taxOverride) {
    // Auto decomposition: single source of truth in shared, same as panel preview.
    const computed = computeInclusiveTaxes(amountPaid, profile.taxes, { currencyPaid });
    return { ...computed, taxOverrideReason: null };
  }

  const o = taxOverride;
  if (!o.taxOverrideReason || o.taxOverrideReason.trim().length === 0) {
    throw new ReceiptError(400, 'TAX_OVERRIDE_REASON_REQUIRED', 'El override de impuestos exige motivo.');
  }
  if (Math.abs(o.subtotal + o.taxTotal - amountPaid) > 1) {
    throw new ReceiptError(400, 'TAX_MISMATCH', 'El desglose no cuadra con el monto cobrado.');
  }
  // D6: the override can only REDUCE tax burden. A non-formal taxpayer cannot
  // detail taxes via this path (it would assert a fiscal fact they never declared).
  const overrideTotal = o.taxDetails.reduce((sum, line) => sum + line.amount, 0);
  if (!profile.isFormalTaxpayer && overrideTotal > 0) {
    throw new ReceiptError(
      400,
      'TAXES_REQUIRE_FORMAL_TAXPAYER',
      'Para detallar impuestos primero debes declarar el negocio como contribuyente formal.',
    );
  }
  const computed = applyTaxOverride(o.subtotal, profile.taxes, {
    taxTotal: o.taxTotal,
    taxDetails: o.taxDetails,
    taxOverrideReason: o.taxOverrideReason,
  });
  return { ...computed, taxOverrideReason: o.taxOverrideReason };
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
 * sequence, audited tax override, no $0 skip, `panel` event scope. Exported
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

    async resolveFiscal(payment, org, input) {
      const profile = resolveFiscalProfile(org.countryCode, org.fiscalConfig);
      // Taxes in integer cents. amountPaid = TOTAL charged (taxes included):
      // auto mode decomposes the base; an override is validated.
      const { subtotal, taxTotal, taxDetails, taxOverrideReason } = resolveTaxBreakdown(
        Number(payment.amountPaid),
        profile,
        payment.currencyPaid,
        input.taxOverride,
      );
      return { profile, subtotal, taxTotal, taxDetails, taxOverrideReason };
    },

    async buildEmitterSnapshot(_payment, org, profile) {
      // Frozen emitter identity (C1): persisted together with the number in
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
        taxOverrideReason: data.taxOverrideReason,
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
     * Paso 1 (síncrono, sin I/O externo salvo DB+cola): valida, calcula
     * impuestos en centavos, asigna el número (atómico), lo persiste y
     * encola `receipt.render`. NUNCA encola email (lo hace el paso 2).
     * La secuencia compartida vive en `receipt-issue.core.ts`.
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
     * Estado del comprobante para el contrato `GET /:id/receipt`
     * (la ruta mapea a 200/202). Nunca 409: el histórico es terminal.
     *
     * El entregable de un comprobante ANULADO es su PDF con sello: mientras
     * ese render no exista, el estado es `pending` y el original **no** se
     * sirve (fail-closed: un documento anulado nunca viaja sin su sello).
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
      // Compose via the shared row mapper (C1: if the payment was numbered
      // after C1 the persisted snapshot wins; null = legacy, live compose).
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
     * Anulación con número: idempotente sin pisar auditoría;
     * sin número → 409 (no hay comprobante que anular).
     *
     * Además encola el render del PDF ANULADO (el sello lo materializa el
     * paso 2, que gatea por `receipt_voided_pdf_key`): la anulación no se
     * completa en el mundo hasta que el documento descargable lo diga.
     * Si el envío a la cola falla, el void YA está persistido y el barrido
     * lo repara — nunca se sirve el original mientras el sello falte.
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
     * Reenvío manual (4 ramas): sin email → 422; histórico → email sin
     * adjunto; numerado con PDF → email; numerado sin PDF → re-encola render
     * (idempotente) y el paso 2 encolará el email al completar.
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
      // Un comprobante anulado no se reenvía: el correo saldría con el PDF
      // de emisión (sin sello) o sin adjunto, y el destinatario no tendría
      // forma de saber que el cobro se anuló. Su entregable es la descarga
      // del PDF ANULADO.
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
        await taskQueue.send({
          type: 'email.payment_receipt',
          paymentId,
          organizationId: orgId,
        });
        return { kind: 'queued', attachment: false };
      }
      if (composed.payment.receiptPdfKey) {
        console.log(`[api-worker] receipts: queuing email (with PDF) — paymentId=${paymentId}`);
        await taskQueue.send({
          type: 'email.payment_receipt',
          paymentId,
          organizationId: orgId,
        });
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
