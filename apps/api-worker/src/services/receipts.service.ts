import type { Db } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import {
  applyTaxOverride,
  buildReceiptDataFromComposed,
  buildReceiptRenderEvent,
  formatPanelReceiptNumber,
  parsePanelReceiptNumber,
  resolveFiscalProfile,
  roundCents,
  toLocalDayString,
  type ITaxDetail,
  type ReceiptData,
} from '@workspace/shared';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';

/**
 * Error con status HTTP + código de negocio. Las rutas lo traducen a
 * `c.json({ error, code }, status)` — el `onError` global no emite `code`,
 * así que NUNCA se confía en él para estos casos (regla toasts: código, no texto).
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
  /** Slug de la org (del perfil/sesión): parte del número humano. */
  orgSlug?: string | null;
  taxOverride?: TaxOverrideInput | null;
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
  // Año LOCAL del emisor (un pago a las 11pm en VE cae en el mismo día/año local).
  return Number(toLocalDayString(timezone, new Date()).slice(0, 4));
}

export function createReceiptsService(
  db: Db,
  receiptQueue: Queue,
  taskQueue?: Queue,
) {
  const receiptsRepo = createReceiptsRepository(db);
  const paymentsRepo = createPaymentsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);

  return {
    /**
     * Paso 1 (síncrono, sin I/O externo salvo DB+cola): valida, calcula
     * impuestos en centavos, asigna el número (atómico), lo persiste y
     * encola `receipt.render`. NUNCA encola email (lo hace el paso 2).
     */
    async assignReceiptNumber(
      input: AssignReceiptNumberInput,
    ): Promise<{ receiptNumber: string; pdfStatus: 'pending' | 'ready' }> {
      const { orgId, paymentId } = input;
      if (!input.timezone || input.timezone.trim().length === 0) {
        throw new ReceiptError(500, 'TIMEZONE_MISSING', 'Timezone de la org es obligatoria.');
      }
      const payment = await paymentsRepo.findById(orgId, paymentId);
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

      // Idempotencia: ya numerado → devuelve el existente sin quemar secuencia.
      if (payment.receiptNumber) {
        if (!payment.receiptPdfKey) {
          await receiptQueue.send(
            buildReceiptRenderEvent({
              paymentId,
              organizationId: orgId,
              receiptNumber: payment.receiptNumber,
            }),
          );
        }
        return {
          receiptNumber: payment.receiptNumber,
          pdfStatus: payment.receiptPdfKey ? 'ready' : 'pending',
        };
      }

      const org = await orgsRepo.findById(orgId);
      if (!org) {
        throw new ReceiptError(404, 'ORG_NOT_FOUND', 'Organización no encontrada.');
      }
      const orgSlug = input.orgSlug ?? org.slug;
      if (!orgSlug) {
        throw new ReceiptError(
          500,
          'ORG_SLUG_MISSING',
          'La organización no tiene slug para numerar.',
        );
      }
      const year = receiptYear(input.timezone);
      const seq = await receiptsRepo.nextDocumentNumber(orgId, 'receipt', year);
      const receiptNumber = formatPanelReceiptNumber(orgSlug, year, seq);
      const parsed = parsePanelReceiptNumber(receiptNumber);
      if (!parsed || parsed.year !== year || parsed.slug !== orgSlug.toLowerCase()) {
        throw new ReceiptError(
          500,
          'RECEIPT_INCOHERENT',
          'Número generado incoherente con año/slug.',
        );
      }

      // Impuestos en centavos enteros. amountPaid = TOTAL cobrado (con impuestos
      // incluidos): en modo auto se descompone la base; con override se valida.
      const profile = resolveFiscalProfile(org.countryCode, org.fiscalConfig);
      const amountPaid = Number(payment.amountPaid);
      let subtotal: number;
      let taxTotal: number;
      let taxDetails: ITaxDetail[];
      let taxOverrideReason: string | null = null;
      if (input.taxOverride) {
        const o = input.taxOverride;
        if (!o.taxOverrideReason || o.taxOverrideReason.trim().length === 0) {
          throw new ReceiptError(
            400,
            'TAX_OVERRIDE_REASON_REQUIRED',
            'El override de impuestos exige motivo.',
          );
        }
        if (Math.abs(o.subtotal + o.taxTotal - amountPaid) > 1) {
          throw new ReceiptError(
            400,
            'TAX_MISMATCH',
            'El desglose no cuadra con el monto cobrado.',
          );
        }
        const computed = applyTaxOverride(o.subtotal, profile.taxes, {
          taxTotal: o.taxTotal,
          taxDetails: o.taxDetails,
          taxOverrideReason: o.taxOverrideReason,
        });
        subtotal = computed.subtotal;
        taxTotal = computed.taxTotal;
        taxDetails = computed.taxDetails;
        taxOverrideReason = o.taxOverrideReason;
      } else {
        const applicable = profile.taxes.filter((t) => {
          if (!t.enabled) return false;
          if (t.condition === undefined) return true;
          if (t.condition === "payment_currency !== 'VES'") {
            return payment.currencyPaid !== 'VES';
          }
          return false;
        });
        if (amountPaid === 0) {
          subtotal = 0;
          taxTotal = 0;
          taxDetails = [];
        } else {
          const rateSum = applicable.reduce((s, t) => s + t.rate, 0);
          subtotal = roundCents(amountPaid / (1 + rateSum));
          const lines = applicable.map((t) => ({
            name: t.name,
            rate: t.rate,
            amount: roundCents(subtotal * t.rate),
          }));
          taxTotal = amountPaid - subtotal;
          // Polvo de redondeo (≤1¢) a la última línea: la suma cuadra exacto.
          const dust =
            taxTotal - lines.reduce((s, l) => s + l.amount, 0);
          if (lines.length > 0 && dust !== 0) {
            lines[lines.length - 1]!.amount += dust;
          }
          taxDetails = lines;
        }
      }

      // Número AUTORITATIVO: el que attachReceipt persistió (bajo concurrencia,
      // un segundo request puede perder el WHERE receipt_number IS NULL y recibir
      // la fila existente; el evento debe llevar SIEMPRE ese número, no el local).
      const attached = await receiptsRepo.attachReceipt(paymentId, orgId, {
        receiptNumber,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
        taxOverrideReason,
        subtotal,
        taxTotal,
        taxDetails,
      });
      const persistedNumber = attached.receiptNumber ?? receiptNumber;

      await receiptQueue.send(
        buildReceiptRenderEvent({
          paymentId,
          organizationId: orgId,
          receiptNumber: persistedNumber,
        }),
      );
      return { receiptNumber: persistedNumber, pdfStatus: 'pending' };
    },

    /**
     * Estado del comprobante para el contrato `GET /:id/receipt`
     * (la ruta mapea a 200/202). Nunca 409: el histórico es terminal.
     */
    async getReceiptState(orgId: string, paymentId: number): Promise<ReceiptState> {
      const composed = await receiptsRepo.getReceiptComposedData(orgId, paymentId);
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      if (!composed.payment.receiptNumber) {
        return { available: false, reason: 'pre_system' };
      }
      if (!composed.payment.receiptPdfKey) {
        return {
          available: true,
          pdfStatus: 'pending',
          receiptNumber: composed.payment.receiptNumber,
        };
      }
      const receipt = buildReceiptDataFromComposed({
        receiptNumber: composed.payment.receiptNumber,
        documentType:
          composed.payment.documentType === 'invoice' ? 'invoice' : 'receipt',
        issuedAt: composed.payment.receiptIssuedAt ?? new Date(),
        payment: {
          id: composed.payment.id,
          amountPaid: Number(composed.payment.amountPaid),
          currencyPaid: composed.payment.currencyPaid,
          exchangeRateApplied: composed.payment.exchangeRateApplied,
          paymentMethod: composed.payment.paymentMethod,
          paymentMethodDetails: composed.payment.paymentMethodDetails,
          paymentDate: composed.payment.paymentDate,
          subtotal:
            composed.payment.subtotal != null
              ? Number(composed.payment.subtotal)
              : null,
          taxTotal:
            composed.payment.taxTotal != null
              ? Number(composed.payment.taxTotal)
              : null,
          taxDetails: composed.payment.taxDetails,
          receiptNumber: composed.payment.receiptNumber,
          receiptVoided: composed.payment.receiptVoided,
          planSnapshotName: composed.payment.planSnapshotName,
          planSnapshotCurrency: composed.payment.planSnapshotCurrency,
        },
        organization: {
          name: composed.organization.name,
          legalName: composed.organization.legalName,
          taxId: composed.organization.taxId,
          address: composed.organization.address,
          countryCode: composed.organization.countryCode,
          primaryCurrency: composed.organization.primaryCurrency,
          timezone: composed.organization.timezone,
          fiscalConfig: composed.organization.fiscalConfig,
        },
        member: composed.member
          ? {
              firstName: composed.member.firstName,
              lastName: composed.member.lastName,
              documentId: composed.member.documentId,
            }
          : null,
        subscription: composed.subscription
          ? {
              startDate: composed.subscription.startDate,
              endDate: composed.subscription.endDate,
            }
          : null,
      });
      return {
        available: true,
        pdfStatus: 'ready',
        receiptNumber: composed.payment.receiptNumber,
        receipt,
        pdfKey: composed.payment.receiptPdfKey,
      };
    },

    /**
     * Anulación con número: idempotente sin pisar auditoría;
     * sin número → 409 (no hay comprobante que anular).
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
      if (!composed.payment.receiptNumber) {
        throw new ReceiptError(
          409,
          'RECEIPT_NOT_ISSUED',
          'El pago no tiene comprobante emitido.',
        );
      }
      if (composed.payment.receiptVoided) {
        return composed.payment;
      }
      return receiptsRepo.markVoided(input.paymentId, input.orgId, {
        by: input.by,
        reason: input.reason,
      });
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
        await taskQueue.send({
          type: 'email.payment_receipt',
          paymentId,
          organizationId: orgId,
        });
        return { kind: 'queued', attachment: false };
      }
      if (composed.payment.receiptPdfKey) {
        await taskQueue.send({
          type: 'email.payment_receipt',
          paymentId,
          organizationId: orgId,
        });
        return { kind: 'queued', attachment: true };
      }
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
