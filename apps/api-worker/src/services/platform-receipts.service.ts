import type { Db } from '@workspace/database/factory';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import {
  buildReceiptRenderEvent,
  computeInclusiveTaxes,
  formatConsoleReceiptNumber,
  parseConsoleReceiptNumber,
  resolveFiscalProfile,
  type ITaxDetail,
} from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { ReceiptError } from './receipts.service';

export interface AssignPlatformReceiptNumberInput {
  paymentId: number;
  /** Pagador (sesión en creación `processing`); en validación no overwrite. */
  payerEmail?: string | null;
  payerName?: string | null;
}

export interface PlatformReceiptHooks {
  assignPlatformReceiptNumber(input: AssignPlatformReceiptNumberInput): Promise<PlatformAssignResult>;
  setPayerIfMissing(paymentId: number, payer: { email: string; name: string }): Promise<void>;
}

/**
 * Resultado del paso 1. `skipped:true + receiptNumber:null` = sin documento
 * (trial/free $0): NO hay nada que esperar, no es un "pending".
 */
export type PlatformAssignResult =
  | { receiptNumber: null; pdfStatus: 'pending'; skipped: true }
  | { receiptNumber: string; pdfStatus: 'pending'; skipped: false };

/** Opts de emisión para `platform-subscriptions.service` (espejo `ReceiptContext`). */
export interface PlatformReceiptContext {
  receipts?: PlatformReceiptHooks;
  /** Actor de sesión (para `payer_*`; solo rellena si está vacío). */
  payer?: { email: string; name: string } | null;
}

export function createPlatformReceiptsService(db: Db, receiptQueue: Queue) {
  const platformReceiptsRepo = createPlatformReceiptsRepository(db);
  const platformSubsRepo = createPlatformSubscriptionsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);

  return {
    /**
     * Paso 1 (síncrono, sin I/O externo salvo DB+cola): valida, calcula
     * impuestos en centavos, asigna el número global (atómico), lo persiste
     * y encola `receipt.render` con `scope:'platform'`. NUNCA encola email
     * (lo hace el paso 2). Trial/free $0 → SKIP (no queman la serie).
     */
    async assignPlatformReceiptNumber(
      input: AssignPlatformReceiptNumberInput,
    ): Promise<PlatformAssignResult> {
      const { paymentId } = input;
      const payment = await platformSubsRepo.findPaymentById(paymentId);
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

      // Trial/free $0: sin documento (no queman la serie continua global).
      const amountPaid = Number(payment.amountPaid);
      if (amountPaid === 0) {
        return { receiptNumber: null, pdfStatus: 'pending', skipped: true };
      }

      // Idempotencia: ya numerado → devuelve el existente sin quemar secuencia.
      if (payment.receiptNumber) {
        if (!payment.receiptPdfKey) {
          await receiptQueue.send(
            buildReceiptRenderEvent({
              scope: 'platform',
              paymentId,
              organizationId: payment.organizationId,
              receiptNumber: payment.receiptNumber,
            }),
          );
        }
        return { receiptNumber: payment.receiptNumber, pdfStatus: 'pending', skipped: false };
      }

      const org = await orgsRepo.findById(payment.organizationId);
      if (!org) {
        throw new ReceiptError(404, 'ORG_NOT_FOUND', 'Organización no encontrada.');
      }
      // Sin override de la org: FitStack define impuestos uniformes por
      // país. País desconocido → error visible con código, nunca default.
      let profile: ReturnType<typeof resolveFiscalProfile>;
      try {
        profile = resolveFiscalProfile(org.countryCode, undefined);
      } catch {
        throw new ReceiptError(
          500,
          'FISCAL_PROFILE_UNKNOWN',
          `País fiscal desconocido (${org.countryCode}).`,
        );
      }
      // Descomposición tax-inclusive: fuente única en shared.
      const computed = computeInclusiveTaxes(amountPaid, profile.taxes, {
        currencyPaid: payment.currencyPaid,
      });
      const subtotal: number = computed.subtotal;
      const taxTotal: number = computed.taxTotal;
      const taxDetails: ITaxDetail[] = computed.taxDetails;

      const seq = await platformReceiptsRepo.nextPlatformDocumentNumber('receipt');
      const receiptNumber = formatConsoleReceiptNumber(seq);
      if (parseConsoleReceiptNumber(receiptNumber) !== seq) {
        throw new ReceiptError(
          500,
          'RECEIPT_INCOHERENT',
          'Número generado incoherente con la secuencia.',
        );
      }

      // Pagador: solo rellena si está vacío (la sesión de validación
      // —soporte— nunca sobrescribe al pagador real). Sin PII cross-org.
      if (input.payerEmail && input.payerEmail.trim().length > 0) {
        await platformReceiptsRepo.setPlatformPayerIfMissing(
          paymentId,
          input.payerEmail,
          input.payerName ?? '',
        );
      }

      // Número AUTORITATIVO: el que attach persistió (bajo concurrencia,
      // un segundo request puede perder el WHERE y recibir la fila
      // existente; el evento lleva SIEMPRE ese número, no el local).
      const persisted = await platformReceiptsRepo.attachPlatformReceipt(paymentId, {
        receiptNumber,
        receiptIssuedAt: new Date(),
        subtotal,
        taxTotal,
        taxDetails,
      });
      await receiptQueue.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId,
          organizationId: payment.organizationId,
          receiptNumber: persisted.receiptNumber!,
        }),
      );
      return { receiptNumber: persisted.receiptNumber!, pdfStatus: 'pending', skipped: false };
    },

    /**
     * Persiste el pagador solo si está vacío (creación `processing` con
     * sesión org renovadora). Nunca sobrescribe (SET ... WHERE NULL).
     */
    async setPayerIfMissing(
      paymentId: number,
      payer: { email: string; name: string },
    ): Promise<void> {
      await platformReceiptsRepo.setPlatformPayerIfMissing(
        paymentId,
        payer.email,
        payer.name,
      );
    },
  };
}

export type PlatformReceiptsService = ReturnType<typeof createPlatformReceiptsService>;
