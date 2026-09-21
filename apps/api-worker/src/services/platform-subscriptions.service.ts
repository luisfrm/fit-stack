import type {
  PlatformSubscriptionsRepository,
  SubscriptionFilters,
  SubscriptionWithDetails,
  PaginatedSubscriptions,
  NewPlatformSubscriptionData,
  NewPlatformPaymentData,
} from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  PAYMENT_STATUSES,
  computePlatformSubscriptionStatus,
  type PlatformSubscriptionStatus,
  type PaymentStatus,
} from '@workspace/shared/constants';
import type { IPaymentMethodDetails, PlanFeaturesV2 } from '@workspace/shared';
import { normalizeFeatures } from '@workspace/shared';
import { HTTPException } from 'hono/http-exception';
import { addDuration } from '../lib/billing-utils';
import type { ExchangeRateProvider } from '../lib/exchange-rates';
import type { PlatformReceiptContext } from './platform-receipts.service';
import { ReceiptError } from './receipts.service';
import {
  COMPENSATION_VOID_REASON,
  compensateFailedEmission,
} from '../lib/subscription-compensation';

/** Provider por defecto: solo moneda base === moneda de pago (sin API externa). */
const SAME_CURRENCY_ONLY_RATE_PROVIDER: ExchangeRateProvider = {
  async getRate(base: string, target: string): Promise<number> {
    if (base === target) return 1;
    throw new Error('Rate provider not configured');
  },
};

export interface CreatePlatformSubscriptionPayload {
  organizationId: string;
  planId: number;
  startDate?: string;
  isTrial?: boolean;
  priceOverrideCents?: number;
  payment: PlatformPaymentPayload;
}

export interface PlatformPaymentPayload {
  amountPaidCents: number;
  currencyPaid: string;
  exchangeRateApplied?: string;
  baseAmountCents?: number;
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;
  status: PaymentStatus;
  paymentDate?: string;
}

export interface RenewPlatformSubscriptionPayload {
  payment: PlatformPaymentPayload;
}

export interface ChangePlatformPlanPayload {
  newPlanId: number;
  isTrial?: boolean;
  priceOverrideCents?: number;
  payment: PlatformPaymentPayload;
}

export interface UpdatePlatformPaymentStatusPayload {
  status: PaymentStatus;
  /** Motivo de anulación/rechazo (se persiste y viaja al void del comprobante). */
  voidReason?: string;
}

/**
 * Payload mínimo de la renovación autoservicio (org-scoped).
 * El body NUNCA contiene montos ni tasas: el backend los dicta.
 */
export interface OrgRenewPayload {
  paymentMethod: string;
  currencyPaid: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;
  paymentDate?: string;
}

/**
 * Safely parses a start date input string into a Date object (UTC midnight for YYYY-MM-DD strings).
 */
function parseStartDate(input?: string): Date {
  if (!input) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00.000Z`);
  }
  return new Date(input);
}

/**
 * Features del plan normalizadas para el snapshot del pago (nunca null:
 * un pago sin features queda con los defaults del catálogo).
 */
function snapshotFeatures(features: PlanFeaturesV2 | null | undefined): PlanFeaturesV2 {
  return normalizeFeatures(features ?? {});
}

export function createPlatformSubscriptionsService(
  platformSubsRepo: PlatformSubscriptionsRepository,
  plansRepo: ReturnType<typeof createPlatformPlansRepository>,
  rateProvider: ExchangeRateProvider = SAME_CURRENCY_ONLY_RATE_PROVIDER
) {
  /**
   * Closure compartida de anulación compensatoria (fase 3): los 4 sitios de
   * emisión deben anular con el mismo motivo y la misma auditoría. Si no hay
   * `paymentId` (el insert nunca llegó a correr) no hay nada que anular.
   */
  const voidPlatformPayment = (paymentId: number | null, by?: string) => async () => {
    if (paymentId == null) return;
    await platformSubsRepo.updatePaymentStatus(paymentId, PAYMENT_STATUSES.VOIDED, {
      voidedBy: by,
      voidReason: COMPENSATION_VOID_REASON,
    });
  };

  return {
    async getAllSubscriptions(
      filters: SubscriptionFilters = {}
    ): Promise<PaginatedSubscriptions> {
      return platformSubsRepo.findAll(filters);
    },

    async getSubscriptionById(id: number): Promise<SubscriptionWithDetails | null> {
      return platformSubsRepo.findById(id);
    },

    async getSubscriptionsByOrganization(
      organizationId: string
    ): Promise<SubscriptionWithDetails[]> {
      return platformSubsRepo.findByOrganization(organizationId);
    },

    async getActiveSubscriptionByOrganization(
      organizationId: string
    ): Promise<SubscriptionWithDetails | null> {
      return platformSubsRepo.findActiveByOrganization(organizationId);
    },

    async getStats() {
      return platformSubsRepo.getStats();
    },

    async getRevenue(months: number) {
      return platformSubsRepo.getMonthlyRevenue(months);
    },

    async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
      const sub = await platformSubsRepo.findActiveByOrganization(organizationId);
      if (!sub) return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;
      return sub.status;
    },

    /* ── Mutations ── */

    /**
     * Crea una nueva plataforma_subscription + su pago inicial (transacción atómica).
     * Soporta planes trial (isTrial=true) y planes free (precio = 0).
     */
    async createSubscriptionWithPayment(
      data: CreatePlatformSubscriptionPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ subscriptionId: number; paymentId: number }> {
      const plan = await plansRepo.findById(data.planId);
      if (!plan) throw new Error('Plan no encontrado');

      const startDate = parseStartDate(data.startDate);
      const isTrial = data.isTrial ?? false;

      // Free plan: validar precio 0
      if (!isTrial && plan.price === 0) {
        // Para planes free, forzar status=validated
      }

      // Si es trial o free, forzar status=validated con paymentMethod='trial'|'free'
      let paymentStatus = data.payment.status;
      let paymentMethod = data.payment.paymentMethod;
      let amountPaidCents = data.payment.amountPaidCents;
      if (isTrial) {
        paymentStatus = PAYMENT_STATUSES.VALIDATED;
        paymentMethod = 'trial';
        amountPaidCents = 0;
      } else if (plan.price === 0) {
        paymentStatus = PAYMENT_STATUSES.VALIDATED;
        paymentMethod = 'free';
        amountPaidCents = 0;
      }

      // Punto 7(a): el periodo solo se front-loadea si el alta nace pagada.
      // Un alta `processing`/`voided`/`refunded` NO regala tiempo:
      // `currentPeriodEnd = startDate` hasta que se valide (ahí el PATCH lo
      // extiende usando el snapshot). Trial/free fuerzan `validated` arriba.
      const trialDays = plan.trialDays ?? 0;
      let currentPeriodEnd = startDate;
      if (paymentStatus === PAYMENT_STATUSES.VALIDATED) {
        if (isTrial && trialDays > 0) {
          currentPeriodEnd = addDuration(startDate, trialDays, 'day');
        } else {
          currentPeriodEnd = addDuration(
            startDate,
            plan.durationValue,
            plan.durationUnit as 'day' | 'week' | 'month' | 'year'
          );
        }
      }

      // 1. Crear subscription
      const newSubData: NewPlatformSubscriptionData = {
        organizationId: data.organizationId,
        planId: data.planId,
        startDate,
        currentPeriodEnd,
        isTrial,
        priceOverride: data.priceOverrideCents ?? null,
      };
      const { id: subscriptionId } = await platformSubsRepo.create(newSubData);

      // Alta en 2 pasos sin red (Neon HTTP no tiene `db.transaction()`): el
      // pago + la emisión se compensan en el `catch` delegando al helper
      // (decisión por relectura, nunca por tipo de error). Semántica SaaS:
      // el alta que queda sin pago válido también anula la suscripción con
      // `cancel()` — nunca `delete()` (regla 6): un `voided` se ignora en el
      // cómputo SaaS y dejaría un periodo front-loadeado sin cobro que lo
      // sostenga. Trial/free $0 (`skipped:true`) = éxito, no compensan.
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        // 2. Crear pago
        const paymentData: NewPlatformPaymentData = {
          subscriptionId,
          organizationId: data.organizationId,
          planId: data.planId,
          planSnapshotName: plan.name,
          planSnapshotPrice: plan.price,
          planSnapshotCurrency: plan.currency,
          planSnapshotDurationValue: plan.durationValue,
          planSnapshotDurationUnit: plan.durationUnit as "day" | "week" | "month" | "year",
          featuresSnapshot: snapshotFeatures(plan.features),
          amountPaid: amountPaidCents,
          currencyPaid: data.payment.currencyPaid,
          exchangeRateApplied: data.payment.exchangeRateApplied ?? null,
          baseAmount: data.payment.baseAmountCents ?? null,
          paymentMethod,
          paymentMethodDetails: data.payment.paymentMethodDetails ?? null,
          status: paymentStatus,
          paymentDate: data.payment.paymentDate
            ? new Date(data.payment.paymentDate)
            : new Date(),
        };
        const createdPayment = await platformSubsRepo.createPayment(paymentData);
        paymentCreated = true;
        paymentId = createdPayment.id;

        // Emisión C2: el paso 1 numera donde el pago queda validado (trial/
        // free $0 hacen SKIP dentro del servicio). Sesión console ≠ pagador:
        // no se pasa payer (queda NULL → solo owners + log).
        if (paymentStatus === PAYMENT_STATUSES.VALIDATED && opts?.receipts) {
          await opts.receipts.assignPlatformReceiptNumber({ paymentId, actor: opts.by });
        }

        return { subscriptionId, paymentId };
      } catch (err) {
        const outcome = await compensateFailedEmission(
          err,
          {
            readPayment: async () =>
              paymentId != null ? platformSubsRepo.findPaymentById(paymentId) : null,
            voidPayment: voidPlatformPayment(paymentId, opts?.by),
            cancelParent: () =>
              platformSubsRepo.cancel(subscriptionId, COMPENSATION_VOID_REASON),
          },
          { paymentCreated },
        );
        if (outcome === 'committed' && paymentId != null) {
          return { subscriptionId, paymentId };
        }
        // Compensated con pago creado: el helper ya lo anuló, pero el alta
        // sigue sin pago válido que la sostenga → se cancela (sin pago
        // creado ya la canceló `cancelParent`). Nunca `delete()` (regla 6,
        // la serie `FS-N` no se vacía).
        // `unresolved` (la relectura no pudo decidir): el alta puede ser válida
        // — no se toca, el error original se re-lanza y el barrido reconcilia.
        if (outcome === 'compensated' && paymentCreated) {
          await platformSubsRepo.cancel(subscriptionId, COMPENSATION_VOID_REASON);
        }
        throw err;
      }
    },

    /**
     * Renueva una suscripción existente bajo el MISMO plan.
     * Lógica acumulativa: extiende currentPeriodEnd desde la fecha actual.
     */
    async renewSubscription(
      subscriptionId: number,
      data: RenewPlatformSubscriptionPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ newPeriodEnd: Date; paymentId: number }> {
      const sub = await platformSubsRepo.findById(subscriptionId);
      if (!sub) throw new Error('Suscripción no encontrada');
      if (sub.cancelledAt) throw new Error('No se puede renovar una suscripción cancelada');

      // Guard contra pagos duplicados pendientes
      const hasPending = await platformSubsRepo.hasPendingPayment(subscriptionId);
      if (hasPending) {
        throw new Error('Ya existe un pago pendiente o en proceso para esta suscripción');
      }

      const plan = await plansRepo.findById(sub.planId);
      if (!plan) throw new Error('Plan no encontrado');

      // Extensión acumulativa: usar currentPeriodEnd si está vigente, sino now
      const baseDate =
        sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
      const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year");

      // Crear pago
      const amountPaidCents =
        data.payment.amountPaidCents === 0
          ? 0
          : data.payment.amountPaidCents ?? plan.price;

      const paymentData: NewPlatformPaymentData = {
        subscriptionId,
        organizationId: sub.organizationId,
        planId: sub.planId,
        planSnapshotName: plan.name,
        planSnapshotPrice: plan.price,
        planSnapshotCurrency: plan.currency,
        planSnapshotDurationValue: plan.durationValue,
        planSnapshotDurationUnit: plan.durationUnit as "day" | "week" | "month" | "year",
        featuresSnapshot: snapshotFeatures(plan.features),
        amountPaid: amountPaidCents,
        currencyPaid: data.payment.currencyPaid,
        exchangeRateApplied: data.payment.exchangeRateApplied ?? null,
        baseAmount: data.payment.baseAmountCents ?? null,
        paymentMethod: data.payment.paymentMethod,
        paymentMethodDetails: data.payment.paymentMethodDetails ?? null,
        status: data.payment.status,
        paymentDate: data.payment.paymentDate
          ? new Date(data.payment.paymentDate)
          : new Date(),
      };
      // Crear pago + extender + emitir en un solo intento compensable: si la
      // emisión falla, el pago se anula y el periodo movido se REVIERTE a su
      // valor previo (`currentPeriodEnd` se leyó antes de extender, así que
      // el write compensatorio es honesto y no necesita transacción). Sin
      // `cancelParent`: la suscripción preexiste.
      const previousPeriodEnd = sub.currentPeriodEnd;
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        const createdPayment = await platformSubsRepo.createPayment(paymentData);
        paymentCreated = true;
        paymentId = createdPayment.id;

        // Extender periodo (side effect del pago)
        if (data.payment.status === PAYMENT_STATUSES.VALIDATED) {
          await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
          // Emisión C2 (sesión console ≠ pagador: sin payer).
          if (opts?.receipts) {
            await opts.receipts.assignPlatformReceiptNumber({ paymentId, actor: opts.by });
          }
        }

        return { newPeriodEnd, paymentId };
      } catch (err) {
        const outcome = await compensateFailedEmission(
          err,
          {
            readPayment: async () =>
              paymentId != null ? platformSubsRepo.findPaymentById(paymentId) : null,
            voidPayment: voidPlatformPayment(paymentId, opts?.by),
            revertEffect: () =>
              platformSubsRepo.updatePeriodEnd(subscriptionId, previousPeriodEnd),
          },
          { paymentCreated },
        );
        if (outcome === 'committed' && paymentId != null) {
          return { newPeriodEnd, paymentId };
        }
        throw err;
      }
    },

    /**
     * Renovación autoservicio (org-scoped, fase 2): registra el pago con
     * status `processing` (queda pendiente de aprobación de soporte en
     * console) SIN extender el periodo. Todo lo económico lo dicta el
     * backend: snapshot del plan (name/precio/moneda/duración/features),
     * tasa vía provider server-side y monto total — el body jamás los envía.
     * Guards de negocio (solo al expirar, sin pendientes, no cancelada)
     * se validan en la ruta; aquí solo se computa y persiste.
     */
    async renewOrgSubscription(
      subscriptionId: number,
      data: OrgRenewPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ paymentId: number }> {
      const sub = await platformSubsRepo.findById(subscriptionId);
      if (!sub) throw new Error('Suscripción no encontrada');
      if (sub.cancelledAt) throw new Error('No se puede renovar una suscripción cancelada');

      const plan = await plansRepo.findById(sub.planId);
      if (!plan) throw new Error('Plan no encontrado');

      // Precio efectivo (override del plan si aplica) y conversión server-side
      const effectivePriceCents = sub.priceOverride ?? plan.price;
      const rate = await rateProvider.getRate(plan.currency, data.currencyPaid);
      const amountPaidCents = Math.round(effectivePriceCents * rate);

      const paymentData: NewPlatformPaymentData = {
        subscriptionId,
        organizationId: sub.organizationId,
        planId: sub.planId,
        planSnapshotName: plan.name,
        planSnapshotPrice: plan.price,
        planSnapshotCurrency: plan.currency,
        planSnapshotDurationValue: plan.durationValue,
        planSnapshotDurationUnit: plan.durationUnit as "day" | "week" | "month" | "year",
        featuresSnapshot: snapshotFeatures(plan.features),
        amountPaid: amountPaidCents,
        currencyPaid: data.currencyPaid,
        exchangeRateApplied: String(rate),
        baseAmount: effectivePriceCents,
        paymentMethod: data.paymentMethod,
        paymentMethodDetails: data.paymentMethodDetails ?? null,
        status: PAYMENT_STATUSES.PROCESSING,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      };
      const { id: paymentId } = await platformSubsRepo.createPayment(paymentData);

      // Pagador real (sesión org renovadora). `processing` no numera: la
      // emisión ocurre al validar en `updatePaymentStatus`.
      if (opts?.receipts && opts?.payer) {
        await opts.receipts.setPayerIfMissing(paymentId, opts.payer);
      }

      return { paymentId };
    },

    /**
     * Cambia el plan de una organización: crea la nueva suscripción y solo
     * entonces cancela la actual.
     *
     * Orden deliberado (create-new-then-cancel-old): si el alta nueva falla y
     * se compensa, la anterior sigue activa — la org nunca queda con cero
     * suscripciones. El `cancel` de la anterior es un efecto distinto de la
     * reversión del periodo y no lo deshace la compensación del alta.
     *
     * Nota: `POST /api/platform/subscriptions/change-plan` **no está montada**
     * en el router hoy (el console la invoca pero el worker no la define); al
     * montarla, si el `cancel` de la vieja fallara quedarían dos activas (peor:
     * es preferible a cero y se documenta aquí).
     */
    async changePlan(
      organizationId: string,
      data: ChangePlatformPlanPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ subscriptionId: number }> {
      const current = await platformSubsRepo.findActiveByOrganization(organizationId);

      // Crear la nueva primero (reenvía opts: el hook emite si valida y la
      // compensación se hereda de `createSubscriptionWithPayment`). Si lanza,
      // la anterior permanece intacta.
      const result = await this.createSubscriptionWithPayment({
        organizationId,
        planId: data.newPlanId,
        isTrial: data.isTrial,
        priceOverrideCents: data.priceOverrideCents,
        payment: data.payment,
      }, opts);

      // Solo con la nueva persistida se cancela la anterior.
      if (current && !current.cancelledAt) {
        await platformSubsRepo.cancel(current.id, 'Plan cambiado');
      }

      return result;
    },

    /**
     * Registra un pago adicional sobre una suscripción existente
     * (sin renovar automáticamente el periodo).
     */
    async registerPayment(
      subscriptionId: number,
      data: PlatformPaymentPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ paymentId: number }> {
      const sub = await platformSubsRepo.findById(subscriptionId);
      if (!sub) throw new Error('Suscripción no encontrada');
      if (sub.cancelledAt) throw new Error('No se puede registrar un pago en una suscripción cancelada');

      const hasPending = await platformSubsRepo.hasPendingPayment(subscriptionId);
      if (hasPending && data.status === PAYMENT_STATUSES.PROCESSING) {
        throw new Error('Ya existe un pago pendiente o en proceso para esta suscripción');
      }

      const paymentData: NewPlatformPaymentData = {
        subscriptionId,
        organizationId: sub.organizationId,
        planId: sub.planId,
        planSnapshotName: sub.planName ?? '',
        planSnapshotPrice: sub.planPrice,
        planSnapshotCurrency: sub.planCurrency,
        planSnapshotDurationValue: sub.planDurationValue,
        planSnapshotDurationUnit: sub.planDurationUnit,
        featuresSnapshot: snapshotFeatures(sub.planFeatures),
        amountPaid: data.amountPaidCents,
        currencyPaid: data.currencyPaid,
        exchangeRateApplied: data.exchangeRateApplied ?? null,
        baseAmount: data.baseAmountCents ?? null,
        paymentMethod: data.paymentMethod,
        paymentMethodDetails: data.paymentMethodDetails ?? null,
        status: data.status,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      };

      // Registro + extensión + emisión en un solo intento compensable: si la
      // emisión falla, el pago se anula y el periodo movido se REVIERTE a
      // `sub.currentPeriodEnd` (leído antes de extender). La suscripción
      // preexiste: sin `cancelParent`.
      const previousPeriodEnd = sub.currentPeriodEnd;
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        const createdPayment = await platformSubsRepo.createPayment(paymentData);
        paymentCreated = true;
        paymentId = createdPayment.id;

        // Si se valida, extender el periodo
        if (data.status === PAYMENT_STATUSES.VALIDATED) {
          const plan = await plansRepo.findById(sub.planId);
          if (plan) {
            const baseDate =
              sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
            const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year");
            await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
          }
          // Emisión C2 (sesión console ≠ pagador: sin payer).
          if (opts?.receipts) {
            await opts.receipts.assignPlatformReceiptNumber({ paymentId, actor: opts.by });
          }
        }

        return { paymentId };
      } catch (err) {
        const outcome = await compensateFailedEmission(
          err,
          {
            readPayment: async () =>
              paymentId != null ? platformSubsRepo.findPaymentById(paymentId) : null,
            voidPayment: voidPlatformPayment(paymentId, opts?.by),
            revertEffect: () =>
              platformSubsRepo.updatePeriodEnd(subscriptionId, previousPeriodEnd),
          },
          { paymentCreated },
        );
        if (outcome === 'committed' && paymentId != null) {
          return { paymentId };
        }
        throw err;
      }
    },

    async cancelSubscription(id: number, reason?: string) {
      return platformSubsRepo.cancel(id, reason);
    },

    async extendSubscriptionPeriod(
      id: number,
      newEndDate: Date
    ): Promise<void> {
      await platformSubsRepo.updatePeriodEnd(id, newEndDate);
    },

    async deleteSubscription(id: number) {
      return platformSubsRepo.delete(id);
    },

    /* ── Payments ── */

    async getSubscriptionPayments(subscriptionId: number) {
      return platformSubsRepo.findPaymentsBySubscription(subscriptionId);
    },

    async getPaymentById(paymentId: number) {
      return platformSubsRepo.findPaymentById(paymentId);
    },

    /**
     * Cambia el estado de un pago SaaS y devuelve el resultado del intento de
     * anulación: el servicio interno LANZA `RECEIPT_NOT_ISSUED` cuando el pago
     * no tiene número, pero el endpoint responde **200** con
     * `receiptVoided: false` + `receiptVoidReason: 'not_issued'` (C6): un
     * silencio no le dice nada al operador.
     */
    async updatePaymentStatus(
      paymentId: number,
      data: UpdatePlatformPaymentStatusPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ receiptVoided: boolean; receiptVoidReason?: 'not_issued' }> {
      const payment = await platformSubsRepo.findPaymentById(paymentId);
      if (!payment) throw new Error('Pago no encontrado');
      // `wasPending` = no estaba validado. Re-PATCH a `validated` no
      // re-extiende ni renumera (idempotencia). Solo un pago `processing`
      // puede transicionar a `validated`: `voided` no puede re-validarse
      // (re-extendería el periodo sobre un cobro anulado y dejaría un
      // `validated` sin comprobante) y `refunded` tampoco (no producido hoy,
      // pero tampoco es una transición legítima). Un re-void idempotente
      // (`voided → voided`) sí pasa.
      const wasPending = payment.status !== PAYMENT_STATUSES.VALIDATED;
      if (
        data.status === PAYMENT_STATUSES.VALIDATED &&
        wasPending &&
        payment.status !== PAYMENT_STATUSES.PROCESSING
      ) {
        throw new HTTPException(409, {
          res: new Response(
            JSON.stringify({
              error: 'Solo un pago en proceso puede validarse',
              code: 'PAYMENT_NOT_REVALIDATABLE',
            }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
        });
      }

      // Un pago de una suscripción cancelada no se valida: persistirlo dejaría
      // un `validated` sin número ni periodo que lo sostenga (invariante
      // validado ⇔ numerado). Fail-closed ANTES de escribir el estado.
      const parentSub = payment.subscriptionId
        ? await platformSubsRepo.findById(payment.subscriptionId)
        : null;
      if (
        data.status === PAYMENT_STATUSES.VALIDATED &&
        wasPending &&
        parentSub?.cancelledAt
      ) {
        throw new HTTPException(409, {
          res: new Response(
            JSON.stringify({
              error: 'No se puede validar un pago de una suscripción cancelada',
              code: 'SUBSCRIPTION_CANCELLED',
            }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
        });
      }

      // Auditoría de anulación SIEMPRE en el pago (haya o no comprobante).
      await platformSubsRepo.updatePaymentStatus(paymentId, data.status, {
        voidedBy: opts?.by,
        voidReason: data.voidReason,
      });

      // VOIDED con número emitido: conserva número + PDF y marca ANULADO.
      // Sin número no hay comprobante que anular, y eso se informa. Solo
      // VOIDED: REFUNDED no toca `receiptVoided`.
      let receiptVoided = false;
      let receiptVoidReason: 'not_issued' | undefined;
      if (data.status === PAYMENT_STATUSES.VOIDED && opts?.receipts && opts.by) {
        try {
          await opts.receipts.markPlatformReceiptVoided({
            paymentId,
            by: opts.by,
            reason: data.voidReason ?? 'Pago anulado',
          });
          receiptVoided = true;
        } catch (err) {
          if (err instanceof ReceiptError && err.code === 'RECEIPT_NOT_ISSUED') {
            receiptVoidReason = 'not_issued';
          } else {
            throw err;
          }
        }
      }

      // Side effects según nuevo status: extender periodo SOLO en la
      // transición a validado, con la duración del SNAPSHOT del pago (no el
      // plan vivo, que pudo cambiar desde la creación). Fallback al plan vivo
      // solo si el snapshot no trae duración. La suscripción no puede estar
      // cancelada aquí (se rechazó arriba), así que el pago validado siempre
      // recibe su número.
      if (
        data.status === PAYMENT_STATUSES.VALIDATED &&
        wasPending &&
        payment.subscriptionId &&
        parentSub
      ) {
        const previousPeriodEnd = parentSub.currentPeriodEnd;
        let duration: { value: number; unit: 'day' | 'week' | 'month' | 'year' } | null = null;
        if (payment.planSnapshotDurationValue != null && payment.planSnapshotDurationUnit) {
          duration = {
            value: payment.planSnapshotDurationValue,
            unit: payment.planSnapshotDurationUnit as 'day' | 'week' | 'month' | 'year',
          };
        } else {
          const plan = await plansRepo.findById(payment.planId);
          if (plan) {
            duration = {
              value: plan.durationValue,
              unit: plan.durationUnit as 'day' | 'week' | 'month' | 'year',
            };
          }
        }
        if (duration) {
          const baseDate =
            parentSub.currentPeriodEnd > new Date() ? parentSub.currentPeriodEnd : new Date();
          const newPeriodEnd = addDuration(baseDate, duration.value, duration.unit);
          await platformSubsRepo.updatePeriodEnd(parentSub.id, newPeriodEnd);
        }
        // Emisión C2 solo en transición →validated (re-PATCH no renumera
        // por idempotencia del attach; sesión console ≠ pagador: sin payer).
        // Si falla, el pago (ya validado en DB) se anula y el periodo movido
        // se REVIERTE a su valor previo. Sin `markPlatformReceiptVoided`:
        // sin número no hay comprobante que anular.
        if (opts?.receipts) {
          try {
            await opts.receipts.assignPlatformReceiptNumber({ paymentId, actor: opts.by });
          } catch (err) {
            const outcome = await compensateFailedEmission(
              err,
              {
                readPayment: () => platformSubsRepo.findPaymentById(paymentId),
                voidPayment: voidPlatformPayment(paymentId, opts?.by),
                revertEffect: () =>
                  platformSubsRepo.updatePeriodEnd(parentSub.id, previousPeriodEnd),
              },
              { paymentCreated: true },
            );
            if (outcome === 'committed') {
              return { receiptVoided, receiptVoidReason };
            }
            throw err;
          }
        }
      }

      return { receiptVoided, receiptVoidReason };
    },

    async getOrganizationInvoices(organizationId: string) {
      return platformSubsRepo.getOrganizationInvoices(organizationId);
    },

    /**
     * Helper: status computado a partir de un subscription row.
     */
    computeStatus(sub: {
      currentPeriodEnd: Date;
      cancelledAt?: Date | null;
      isTrial?: boolean;
      hasValidatedPayment: boolean;
    }): PlatformSubscriptionStatus {
      return computePlatformSubscriptionStatus({
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelledAt: sub.cancelledAt,
        isTrial: sub.isTrial,
        hasValidatedPayment: sub.hasValidatedPayment,
      });
    },
  };
}

export type PlatformSubscriptionsService = ReturnType<
  typeof createPlatformSubscriptionsService
>;
