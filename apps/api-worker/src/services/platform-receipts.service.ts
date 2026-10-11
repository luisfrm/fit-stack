import type { Db } from '@workspace/database/factory';
import {
  createPlatformReceiptsRepository,
  type AttachPlatformReceiptInput,
} from '@workspace/database/repositories/platform-receipts';
import {
  buildPlatformEmitterSnapshot,
  buildReceiptRenderEvent,
  computeInclusiveTaxes,
  composePlatformReceipt,
  formatConsoleReceiptNumber,
  parseConsoleReceiptNumber,
  platformEmitterFromSettings,
  resolveFiscalProfile,
  type FiscalProfile,
  type ReceiptData,
  type ReceiptDocumentType,
} from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import {
  issueReceipt,
  ReceiptError,
  type IssuerProfile,
  type ReceiptIssueAttached,
  type ReceiptIssuePayment,
} from './receipt-issue.core';

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

/**
 * Platform repositories the issuer profile orchestrates (structural ports:
 * the unit test fakes exactly these).
 */
export interface PlatformIssuerRepos {
  platformSubsRepo: {
    findPaymentById(paymentId: number): Promise<ReceiptIssuePayment | null>;
  };
  platformReceiptsRepo: {
    nextPlatformDocumentNumber(type: ReceiptDocumentType): Promise<number>;
    releaseLastPlatformNumber(
      type: ReceiptDocumentType,
      seq: number,
    ): Promise<{ released: boolean }>;
    attachPlatformReceipt(
      paymentId: number,
      input: AttachPlatformReceiptInput,
    ): Promise<ReceiptIssueAttached>;
    setPlatformPayerIfMissing(
      paymentId: number,
      payerEmail: string,
      payerName: string,
    ): Promise<void>;
  };
  platformSettingsRepo: {
    getAll(): Promise<Record<string, string>>;
  };
}

/**
 * Platform issuer profile (FitStack, SaaS): global continuous sequence, no
 * year, $0 trial/free skip, no tax override, payer capture, `platform` event
 * scope. Exported for the step-order unit test; routes only see
 * `createPlatformReceiptsService`.
 */
export function createPlatformIssuerProfile(repos: PlatformIssuerRepos): IssuerProfile<null> {
  const { platformSubsRepo, platformReceiptsRepo, platformSettingsRepo } = repos;

  return {
    logTag: 'platform-receipts',
    releaseFailureLabel: 'platform receipt emission',
    incoherentMessage: 'Número generado incoherente con la secuencia.',

    resolveYear() {
      // FitStack is a single issuer: `FS-N` is continuous, no year.
      return null;
    },

    loadPayment(input) {
      return platformSubsRepo.findPaymentById(input.paymentId);
    },

    resolveOrgId(payment) {
      return payment.organizationId;
    },

    shouldSkip(payment) {
      // Trial/free $0: no document (never burns the global continuous series).
      return Number(payment.amountPaid) === 0;
    },

    async resolveFiscal(payment, org) {
      // No org override: FitStack defines uniform taxes per country.
      // Unknown country → visible error with code, never a default.
      let profile: FiscalProfile;
      try {
        profile = resolveFiscalProfile(org.countryCode);
      } catch {
        throw new ReceiptError(
          500,
          'FISCAL_PROFILE_UNKNOWN',
          `País fiscal desconocido (${org.countryCode}).`,
        );
      }
      // Tax-inclusive decomposition: single source in shared.
      const computed = computeInclusiveTaxes(Number(payment.amountPaid), profile.taxes, {
        currencyPaid: payment.currencyPaid,
      });
      return {
        profile,
        subtotal: computed.subtotal,
        taxTotal: computed.taxTotal,
        taxDetails: computed.taxDetails,
        taxOverrideReason: null,
      };
    },

    async buildEmitterSnapshot(payment, org, profile) {
      // Frozen emitter identity (C1): FitStack (settings) + receptor country
      // profile. Built BEFORE consuming the global sequence (nothing burns a
      // correlative).
      return buildPlatformEmitterSnapshot(
        {
          receptor: org,
          emitter: platformEmitterFromSettings(await platformSettingsRepo.getAll()),
          currency: payment.planSnapshotCurrency,
        },
        profile,
      );
    },

    async nextNumber() {
      const seq = await platformReceiptsRepo.nextPlatformDocumentNumber('receipt');
      const receiptNumber = formatConsoleReceiptNumber(seq);
      return {
        seq,
        receiptNumber,
        coherent: parseConsoleReceiptNumber(receiptNumber) === seq,
      };
    },

    releaseNumber(_orgId, _year, seq) {
      return platformReceiptsRepo.releaseLastPlatformNumber('receipt', seq);
    },

    async capturePayer(input) {
      // Payer: only fills when empty (the validation session — support —
      // never overwrites the real payer). No cross-org PII.
      if (input.payerEmail && input.payerEmail.trim().length > 0) {
        await platformReceiptsRepo.setPlatformPayerIfMissing(
          input.paymentId,
          input.payerEmail,
          input.payerName ?? '',
        );
      }
    },

    attach(_org, data, input) {
      return platformReceiptsRepo.attachPlatformReceipt(input.paymentId, {
        receiptNumber: data.receiptNumber,
        receiptIssuedAt: data.receiptIssuedAt,
        subtotal: data.subtotal,
        taxTotal: data.taxTotal,
        taxDetails: data.taxDetails,
        emitterSnapshot: data.emitterSnapshot,
        issuedBy: data.issuedBy,
      });
    },

    buildRenderEvent(paymentId, orgId, receiptNumber) {
      return buildReceiptRenderEvent({
        scope: 'platform',
        paymentId,
        organizationId: orgId,
        receiptNumber,
      });
    },
  };
}

export function createPlatformReceiptsService(db: Db, receiptQueue: Queue, taskQueue?: Queue) {
  const platformReceiptsRepo = createPlatformReceiptsRepository(db);
  const platformSubsRepo = createPlatformSubscriptionsRepository(db);
  const orgsRepo = createOrganizationsRepository(db);
  const platformSettingsRepo = createPlatformSettingsRepository(db);
  const profile = createPlatformIssuerProfile({
    platformSubsRepo,
    platformReceiptsRepo,
    platformSettingsRepo,
  });

  return {
    /**
     * Paso 1 (síncrono, sin I/O externo salvo DB+cola): valida, calcula
     * impuestos en centavos, asigna el número global (atómico), lo persiste
     * y encola `receipt.render` con `scope:'platform'`. NUNCA encola email
     * (lo hace el paso 2). Trial/free $0 → SKIP (no queman la serie).
     * La secuencia compartida vive en `receipt-issue.core.ts`.
     */
    async assignPlatformReceiptNumber(
      input: AssignPlatformReceiptNumberInput,
    ): Promise<PlatformAssignResult> {
      return issueReceipt(profile, { orgsRepo, queue: receiptQueue }, input);
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
     * UPDATE siempre, así que el early-return vive aquí); sin número → 409
     * (no hay comprobante que anular). `by` obligatorio (fail-closed: nunca
     * void anónimo).
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
     * `getReceiptState` de Panel). Compone con el mapper shared de filas:
     * el mismo camino que el consumer de jobs-worker (precedente Panel).
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
      // Compose via the shared row mapper (C1: if the payment was numbered
      // after C1 the persisted snapshot wins; null = legacy, live compose).
      const receipt = composePlatformReceipt(composed);
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
