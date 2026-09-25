import type { Db } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import {
  applyTaxOverride,
  buildEmitterSnapshot,
  buildReceiptDataFromComposed,
  buildReceiptRenderEvent,
  computeInclusiveTaxes,
  formatPanelReceiptNumber,
  parsePanelReceiptNumber,
  resolveFiscalProfile,
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

export function createReceiptsService(
  db: Db,
  receiptQueue: Queue,
  taskQueue?: Queue,
) {
  const receiptsRepo = createReceiptsRepository(db);
  const paymentsRepo = createPaymentsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);

  /**
   * Re-encola el render si el PDF aún no existe y devuelve el estado real
   * (`pending` si falta el PDF). Idempotente: el paso 2 hace overwrite sobre
   * la MISMA key y su propio gate decide el email.
   */
  async function requeueRenderIfPdfPending(
    paymentId: number,
    orgId: string,
    receiptNumber: string,
    receiptPdfKey: string | null | undefined,
  ): Promise<'pending' | 'ready'> {
    if (receiptPdfKey) return 'ready';
    console.log(
      `[api-worker] receipts: re-queuing render — paymentId=${paymentId} receiptNumber=${receiptNumber} org=${orgId}`,
    );
    await receiptQueue.send(
      buildReceiptRenderEvent({ paymentId, organizationId: orgId, receiptNumber }),
    );
    console.log(`[api-worker] receipts: render re-queued — paymentId=${paymentId}`);
    return 'pending';
  }

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
        const pdfStatus = await requeueRenderIfPdfPending(
          paymentId,
          orgId,
          payment.receiptNumber,
          payment.receiptPdfKey,
        );
        return { receiptNumber: payment.receiptNumber, pdfStatus };
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
      // Slug/año válidos ANTES de consumir la secuencia: si el formato es
      // imposible, `formatPanelReceiptNumber` lanzaría con el número ya
      // quemado. Se valida con seq=1 (el formato no depende del valor).
      formatPanelReceiptNumber(orgSlug, year, 1);

      // Impuestos en centavos enteros. amountPaid = TOTAL cobrado (con impuestos
      // incluidos): en modo auto se descompone la base; con override se valida.
      //
      // ⚠️ ORDEN CRÍTICO: el perfil fiscal y la descomposición se calculan
      // ANTES de consumir la secuencia. Un número consumido NUNCA se reutiliza,
      // así que un fallo aquí (país desconocido, monto no entero) quemaría un
      // correlativo y dejaría un hueco inexplicado en el reporte de auditoría.
      const profile = resolveFiscalProfile(org.countryCode, org.fiscalConfig);
      // Identidad del emisor CONGELADA (C1): se persiste junto al número en
      // `attachReceipt`, así que se construye ANTES de consumir la secuencia
      // (si algo lanza aquí, no se quema ningún correlativo).
      const emitterSnapshot = buildEmitterSnapshot(
        {
          name: org.name,
          legalName: org.legalName,
          taxId: org.taxId,
          address: org.address,
          countryCode: org.countryCode,
          primaryCurrency: org.primaryCurrency,
          timezone: org.timezone,
          fiscalConfig: org.fiscalConfig,
        },
        profile,
      );
      const amountPaid = Number(payment.amountPaid);
      // Tax breakdown: validate + compute via helper to keep this function flat.
      const { subtotal, taxTotal, taxDetails, taxOverrideReason } = resolveTaxBreakdown(
        amountPaid,
        profile,
        payment.currencyPaid,
        input.taxOverride,
      );

      // Guarda tardía: entre la lectura del pago y este punto otra entrega
      // concurrente pudo numerarlo. Releer evita consumir un número que ya no
      // se va a persistir (prevenir la carrera, además de compensarla).
      const fresh = await paymentsRepo.findById(orgId, paymentId);
      if (fresh?.receiptNumber) {
        const pdfStatus = await requeueRenderIfPdfPending(
          paymentId,
          orgId,
          fresh.receiptNumber,
          fresh.receiptPdfKey,
        );
        return { receiptNumber: fresh.receiptNumber, pdfStatus };
      }

      const seq = await receiptsRepo.nextDocumentNumber(orgId, 'receipt', year);
      const receiptNumber = formatPanelReceiptNumber(orgSlug, year, seq);
      const parsed = parsePanelReceiptNumber(receiptNumber);
      if (parsed?.year !== year || parsed.slug !== orgSlug.toLowerCase()) {
        // Defensivo (slug/año ya validados): no dejar el número colgado.
        await receiptsRepo.releaseLastNumber(orgId, 'receipt', year, seq);
        throw new ReceiptError(
          500,
          'RECEIPT_INCOHERENT',
          'Número generado incoherente con año/slug.',
        );
      }

      // Número AUTORITATIVO: el que attachReceipt persistió (bajo concurrencia,
      // un segundo request puede perder el WHERE receipt_number IS NULL y recibir
      // la fila existente; el evento debe llevar SIEMPRE ese número, no el local).
      // `document_type` siempre `'receipt'`: la etiqueta aplicada la decide el
      // gate (`resolveDocumentLabel`, HAS_FISCAL_HOMOLOGATION=false), no el caller.
      const attached = await receiptsRepo.attachReceipt(paymentId, orgId, {
        receiptNumber,
        documentType: 'receipt',
        receiptIssuedAt: new Date(),
        taxOverrideReason,
        subtotal,
        taxTotal,
        taxDetails,
        emitterSnapshot,
        issuedBy: input.actor ?? null,
      });
      const persistedNumber = attached.receiptNumber ?? receiptNumber;

      // Carrera perdida: otra entrega ya numeró el pago, este número local no
      // se persistió. Compensar la secuencia si seguimos siendo el último
      // consumidor; si no, el número es irreversible y queda como hueco.
      //
      // NO compensar ante una EXCEPCIÓN de `attachReceipt`: si el error llegó
      // después de que la sentencia commiteó (respuesta perdida, timeout),
      // devolver el número haría que se reasigne a otro pago → duplicado, que
      // es peor que un hueco. Aquí el `persistedNumber` se leyó de la fila, así
      // que la no-persistencia está confirmada.
      if (persistedNumber !== receiptNumber) {
        const { released } = await receiptsRepo.releaseLastNumber(
          orgId,
          'receipt',
          year,
          seq,
        );
        if (!released) {
          console.error(
            `receipt emission: correlativo ${receiptNumber} no persistido y no liberable (la secuencia ya avanzó).`,
          );
        }
      }

      console.log(
        `[api-worker] receipts: queuing render — paymentId=${paymentId} receiptNumber=${persistedNumber} org=${orgId}`,
      );
      await receiptQueue.send(
        buildReceiptRenderEvent({
          paymentId,
          organizationId: orgId,
          receiptNumber: persistedNumber,
        }),
      );
      console.log(`[api-worker] receipts: render queued — paymentId=${paymentId} receiptNumber=${persistedNumber}`);
      return {
        receiptNumber: persistedNumber,
        pdfStatus: attached.receiptPdfKey ? 'ready' : 'pending',
      };
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
        // C1: si el pago se numeró tras C1, el snapshot manda (NULL = legacy).
        emitterSnapshot: composed.payment.emitterSnapshot,
      });
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
