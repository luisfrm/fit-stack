import type { Db } from '@workspace/database/factory';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import {
  buildPlatformEmitterSnapshot,
  buildPlatformReceiptDataFromComposed,
  buildReceiptRenderEvent,
  computeInclusiveTaxes,
  formatConsoleReceiptNumber,
  parseConsoleReceiptNumber,
  platformEmitterFromSettings,
  resolveFiscalProfile,
  type ITaxDetail,
  type ReceiptData,
} from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { ReceiptError } from './receipts.service';

export interface AssignPlatformReceiptNumberInput {
  paymentId: number;
  /** Pagador (sesión en creación `processing`); en validación no overwrite. */
  payerEmail?: string | null;
  payerName?: string | null;
  /** Actor de sesión que emite (C5); sin sesión queda `NULL`, nunca inventado. */
  actor?: string | null;
}

export interface PlatformReceiptHooks {
  assignPlatformReceiptNumber(input: AssignPlatformReceiptNumberInput): Promise<PlatformAssignResult>;
  setPayerIfMissing(paymentId: number, payer: { email: string; name: string }): Promise<void>;
  markPlatformReceiptVoided(input: {
    paymentId: number;
    by: string;
    reason: string;
  }): Promise<unknown>;
}

/**
 * Resultado del paso 1. `skipped:true + receiptNumber:null` = sin documento
 * (trial/free $0): NO hay nada que esperar, no es un "pending".
 */
export type PlatformAssignResult =
  | { receiptNumber: null; pdfStatus: 'pending'; skipped: true }
  | { receiptNumber: string; pdfStatus: 'pending' | 'ready'; skipped: false };

/** Opts de emisión para `platform-subscriptions.service` (espejo `ReceiptContext`). */
export interface PlatformReceiptContext {
  receipts?: PlatformReceiptHooks;
  /** Actor de sesión (para `payer_*`; solo rellena si está vacío). */
  payer?: { email: string; name: string } | null;
  /**
   * Actor de sesión: `voided_by` en la rama VOIDED y `issued_by` al numerar
   * (C5). Sin sesión no se inventa actor: null explícito.
   */
  by?: string;
}

export function createPlatformReceiptsService(db: Db, receiptQueue: Queue, taskQueue?: Queue) {
  const platformReceiptsRepo = createPlatformReceiptsRepository(db);
  const platformSubsRepo = createPlatformSubscriptionsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);
  const platformSettingsRepo = createPlatformSettingsRepository(db);

  /**
   * Re-encola el render si el PDF aún no existe y devuelve el estado real.
   * Espejo de `requeueRenderIfPdfPending` (Panel): mismo evento, `scope`
   * distinto. Idempotente — el paso 2 hace overwrite y gatea el email.
   */
  async function requeueRenderIfPdfPending(
    paymentId: number,
    orgId: string,
    receiptNumber: string,
    receiptPdfKey: string | null | undefined,
  ): Promise<'pending' | 'ready'> {
    if (receiptPdfKey) return 'ready';
    console.log(
      `[api-worker] platform-receipts: re-queuing render — paymentId=${paymentId} receiptNumber=${receiptNumber} org=${orgId}`,
    );
    await receiptQueue.send(
      buildReceiptRenderEvent({
        scope: 'platform',
        paymentId,
        organizationId: orgId,
        receiptNumber,
      }),
    );
    console.log(`[api-worker] platform-receipts: render re-queued — paymentId=${paymentId}`);
    return 'pending';
  }

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
        const pdfStatus = await requeueRenderIfPdfPending(
          paymentId,
          payment.organizationId,
          payment.receiptNumber,
          payment.receiptPdfKey,
        );
        return { receiptNumber: payment.receiptNumber, pdfStatus, skipped: false };
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

      // Guarda tardía (espejo Panel): releer antes de consumir el correlativo
      // global evita quemar un número que otra entrega concurrente ya usó.
      const fresh = await platformSubsRepo.findPaymentById(paymentId);
      if (fresh?.receiptNumber) {
        const pdfStatus = await requeueRenderIfPdfPending(
          paymentId,
          fresh.organizationId,
          fresh.receiptNumber,
          fresh.receiptPdfKey,
        );
        return { receiptNumber: fresh.receiptNumber, pdfStatus, skipped: false };
      }

      // Identidad del emisor CONGELADA (C1): FitStack (settings) + perfil del
      // país receptor. Se persiste junto al número, así que se construye
      // ANTES de consumir la secuencia global (nada quema un correlativo).
      const emitterSnapshot = buildPlatformEmitterSnapshot(
        {
          receptor: {
            name: org.name,
            legalName: org.legalName,
            taxId: org.taxId,
            countryCode: org.countryCode,
            timezone: org.timezone,
          },
          emitter: platformEmitterFromSettings(await platformSettingsRepo.getAll()),
          currency: payment.planSnapshotCurrency,
        },
        profile,
      );

      const seq = await platformReceiptsRepo.nextPlatformDocumentNumber('receipt');
      const receiptNumber = formatConsoleReceiptNumber(seq);
      if (parseConsoleReceiptNumber(receiptNumber) !== seq) {
        // Defensivo: no dejar el número colgado.
        await platformReceiptsRepo.releaseLastPlatformNumber('receipt', seq);
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
        emitterSnapshot,
        issuedBy: input.actor ?? null,
      });
      const persistedNumber = persisted.receiptNumber ?? receiptNumber;

      // Carrera perdida: otra entrega ya numeró el pago. Compensar la
      // secuencia global si seguimos siendo el último consumidor; si no, el
      // número es irreversible y queda como hueco auditado.
      if (persistedNumber !== receiptNumber) {
        const { released } = await platformReceiptsRepo.releaseLastPlatformNumber(
          'receipt',
          seq,
        );
        if (!released) {
          console.error(
            `platform receipt emission: correlativo ${receiptNumber} no persistido y no liberable (la secuencia ya avanzó).`,
          );
        }
      }

      console.log(
        `[api-worker] platform-receipts: queuing render — paymentId=${paymentId} receiptNumber=${persistedNumber} org=${payment.organizationId}`,
      );
      await receiptQueue.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId,
          organizationId: payment.organizationId,
          receiptNumber: persistedNumber,
        }),
      );
      console.log(`[api-worker] platform-receipts: render queued — paymentId=${paymentId} receiptNumber=${persistedNumber}`);
      return {
        receiptNumber: persistedNumber,
        pdfStatus: persisted.receiptPdfKey ? 'ready' : 'pending',
        skipped: false,
      };
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

    /**
     * Anulación con número: idempotente sin pisar auditoría (el repo hace
     * UPDATE siempre, así que el early-return vive aquí); sin número →
     * 409 (no hay comprobante que anular). `by` obligatorio (fail-closed:
     * nunca void anónimo).
     *
     * Encola el render del PDF ANULADO (espejo Panel): el sello lo materializa
     * el paso 2 y hasta entonces el original no se sirve. Si el envío a la
     * cola falla, el void ya está persistido y el barrido lo repara.
     */
    async markPlatformReceiptVoided(input: {
      paymentId: number;
      by: string;
      reason: string;
    }) {
      if (!input.by || input.by.trim().length === 0) {
        throw new ReceiptError(400, 'ACTOR_REQUIRED', 'La anulación exige actor.');
      }
      const payment = await platformSubsRepo.findPaymentById(input.paymentId);
      if (!payment) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      const receiptNumber = payment.receiptNumber;
      if (!receiptNumber) {
        throw new ReceiptError(
          409,
          'RECEIPT_NOT_ISSUED',
          'El pago no tiene comprobante emitido.',
        );
      }

      const row = payment.receiptVoided
        ? payment
        : await platformReceiptsRepo.markPlatformVoided(input.paymentId, {
            by: input.by,
            reason: input.reason,
          });

      if (!row.receiptVoidedPdfKey) {
        console.log(
          `[api-worker] platform-receipts: queuing voided render — paymentId=${input.paymentId} receiptNumber=${receiptNumber}`,
        );
        await receiptQueue.send(
          buildReceiptRenderEvent({
            scope: 'platform',
            paymentId: input.paymentId,
            organizationId: payment.organizationId,
            receiptNumber,
          }),
        );
      }
      return row;
    },

    /**
     * Estado del comprobante SaaS (contrato 3 estados, nunca 409; espejo
     * `getReceiptState` de Panel). El mapeo a `PlatformComposeReceiptInput`
     * es twin intencional del consumer jobs-worker (precedente Panel).
     */
    async getPlatformReceiptState(paymentId: number): Promise<
      | { available: true; pdfStatus: 'ready'; receiptNumber: string; receipt: ReceiptData; pdfKey: string }
      | { available: true; pdfStatus: 'pending'; receiptNumber: string }
      | { available: false; reason: 'pre_system' }
    > {
      const composed = await platformReceiptsRepo.getPlatformReceiptComposedData(paymentId);
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      if (!composed.payment.receiptNumber) {
        return { available: false, reason: 'pre_system' };
      }
      // Espejo Panel: un comprobante anulado entrega SOLO su PDF con sello.
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
      const { payment, subscription, organization, emitter } = composed;
      const receipt = buildPlatformReceiptDataFromComposed({
        receiptNumber: composed.payment.receiptNumber,
        // Defensivo: invariante receiptIssuedAt non-null cuando hay pdfKey
        // (ambos se setean juntos en el paso 1 / attach).
        issuedAt: composed.payment.receiptIssuedAt ?? new Date(),
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
        emitter: platformEmitterFromSettings(emitter),
        // C1: si el pago se numeró tras C1, el snapshot manda (NULL = legacy).
        emitterSnapshot: payment.emitterSnapshot,
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
     * Reenvío manual (4 ramas congeladas): sin destinatarios → 422;
     * pre_system → `presystem` (sin encolar: terminal, nunca 409);
     * numerado sin PDF → `pending` (re-encola render, el paso 2 avisa);
     * ready → encola `email.org_payment_received` con payer de DB.
     */
    async resendPlatformReceiptEmail(
      paymentId: number,
    ): Promise<
      | { kind: 'queued'; attachment: boolean }
      | { kind: 'pending' }
      | { kind: 'presystem' }
    > {
      const composed = await platformReceiptsRepo.getPlatformReceiptComposedData(paymentId);
      if (!composed) {
        throw new ReceiptError(404, 'PAYMENT_NOT_FOUND', 'Pago no encontrado.');
      }
      if (!taskQueue) {
        throw new ReceiptError(500, 'QUEUE_MISSING', 'Cola de emails no disponible.');
      }
      const owners = await orgsRepo.listOwnerEmails(composed.organization.id);
      const payerEmail = composed.payment.payerEmail?.trim() || null;
      const recipients = new Set(
        [payerEmail, ...owners].filter((e): e is string => !!e && e.trim().length > 0),
      );
      if (recipients.size === 0) {
        throw new ReceiptError(
          422,
          'PAYER_EMAIL_MISSING',
          'El pago no tiene destinatarios: registre un email del pagador.',
        );
      }
      if (!composed.payment.receiptNumber) {
        return { kind: 'presystem' };
      }
      // Espejo Panel: un comprobante anulado no se reenvía por email (saldría
      // con el PDF de emisión o sin adjunto, sin forma de ver el sello).
      if (composed.payment.receiptVoided) {
        throw new ReceiptError(
          409,
          'RECEIPT_VOIDED',
          'El comprobante está anulado: no se reenvía.',
        );
      }
      if (composed.payment.receiptPdfKey) {
        await taskQueue.send({
          type: 'email.org_payment_received',
          paymentId,
          organizationId: composed.organization.id,
          ...(payerEmail
            ? { payerEmail, payerName: composed.payment.payerName?.trim() || '' }
            : {}),
        });
        return { kind: 'queued', attachment: true };
      }
      // PDF not yet rendered — re-queue render so step 2 sends the email.
      console.log(
        `[api-worker] platform-receipts: PDF missing, re-queuing render for email — paymentId=${paymentId} receiptNumber=${composed.payment.receiptNumber}`,
      );
      await receiptQueue.send(
        buildReceiptRenderEvent({
          scope: 'platform',
          paymentId,
          organizationId: composed.organization.id,
          receiptNumber: composed.payment.receiptNumber,
        }),
      );
      return { kind: 'pending' };
    },
  };
}

export type PlatformReceiptsService = ReturnType<typeof createPlatformReceiptsService>;
