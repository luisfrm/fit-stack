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
  type PlatformSubscriptionStatus,
  type PaymentStatus,
} from '@workspace/shared/constants';
import type { IPaymentMethodDetails, PlanFeaturesV2 } from '@workspace/shared';
import { normalizeFeatures, addDuration, API_ERROR_CODES } from '@workspace/shared';
import { HTTPException } from 'hono/http-exception';
import type { ExchangeRateProvider } from '../lib/exchange-rates';
import type { PlatformReceiptContext } from './platform-receipts.service';
import { ReceiptError } from './receipts.service';
import {
  COMPENSATION_VOID_REASON,
  compensateFailedEmission,
} from '../lib/subscription-compensation';
import { isPostgresForeignKeyViolation } from '../lib/errors';

/** Provider por defecto: solo moneda base === moneda de pago (sin API externa). */
const SAME_CURRENCY_ONLY_RATE_PROVIDER: ExchangeRateProvider = {
  async getRate(base: string, target: string): Promise<number> {
    if (base === target) return 1;
    throw new Error('Rate provider not configured');
  },
};

/**
 * A SaaS subscription with payments is financial history: it is cancelled,
 * never deleted. One contract for both the app-level pre-check and the
 * DB-level backstop, so the console toast keeps resolving by `code`.
 */
const subscriptionHasPaymentsError = () =>
  new HTTPException(409, {
    res: new Response(
      JSON.stringify({
        error:
          'La suscripción tiene pagos asociados; cancelarla en lugar de borrarla.',
        code: 'SUBSCRIPTION_HAS_PAYMENTS',
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ),
  });

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

export interface UpdatePlatformPaymentStatusPayload {
  status: PaymentStatus;
  /** Reason for void/rejection (persisted and passed to receipt voiding). */
  voidReason?: string;
}

/**
 * Minimal payload for self-service renewal (org-scoped).
 * The body NEVER contains amounts or rates: backend dictates them.
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
 * Normalized plan features for payment snapshot (never null:
 * a payment without features retains catalog defaults).
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
   * Shared compensatory void closure: all 4 emission sites
   * must void with the same reason and audit trail. If there is no
   * `paymentId` (insert never ran) there is nothing to void.
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
     * Creates a new platform_subscription + initial payment (atomic transaction).
     * Supports trial plans (isTrial=true) and free plans (price = 0).
     */
    async createSubscriptionWithPayment(
      data: CreatePlatformSubscriptionPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ subscriptionId: number; paymentId: number }> {
      const plan = await plansRepo.findById(data.planId);
      if (!plan) throw new Error('Plan no encontrado');

      const startDate = parseStartDate(data.startDate);
      const isTrial = data.isTrial ?? false;

      // If trial or free, force status=validated with paymentMethod='trial'|'free'
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

      // Point 7(a): period is only front-loaded if registration is born paid.
      // A registration `processing`/`voided`/`refunded` does NOT grant free time:
      // `currentPeriodEnd = startDate` until validated (where PATCH extends
      // it using snapshot). Trial/free force `validated` above.
      const trialDays = plan.trialDays ?? 0;
      let currentPeriodEnd = startDate;
      if (paymentStatus === PAYMENT_STATUSES.VALIDATED) {
        if (isTrial && trialDays > 0) {
          currentPeriodEnd = addDuration(startDate, trialDays, 'day', 'UTC');
        } else {
          currentPeriodEnd = addDuration(
            startDate,
            plan.durationValue,
            plan.durationUnit as 'day' | 'week' | 'month' | 'year',
            'UTC'
          );
        }
      }

      // 1. Create subscription
      const newSubData: NewPlatformSubscriptionData = {
        organizationId: data.organizationId,
        planId: data.planId,
        startDate,
        currentPeriodEnd,
        isTrial,
        priceOverride: data.priceOverrideCents ?? null,
      };
      const { id: subscriptionId } = await platformSubsRepo.create(newSubData);

      // Registration in 2 steps without network (Neon HTTP lacks `db.transaction()`):
      // payment + emission are compensated in `catch` delegating to helper
      // (decision by re-read, never by error type). SaaS semantics:
      // a registration left without valid payment also cancels subscription with
      // `cancel()` - never `delete()` (rule 6): a `voided` payment is ignored in
      // SaaS compute and would leave a front-loaded period without backing payment.
      // Trial/free $0 (`skipped:true`) = success, no compensation needed.
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        // 2. Create payment
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

        // Emission: step 1 numbers where payment is validated (trial/
        // free $0 SKIP inside service). Console session != payer:
        // no payer passed (remains NULL -> owners only + log).
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
        // Compensated with payment created: the helper already voided it, but
        // the registration remains without valid backing payment -> cancelled
        // (if no payment created, `cancelParent` already cancelled it).
        // Never `delete()` (rule 6, `FS-N` sequence is never gapped).
        // `unresolved` (re-read could not decide): registration might be valid
        // - untouched, original error is re-thrown and sweep reconciles.
        if (outcome === 'compensated' && paymentCreated) {
          await platformSubsRepo.cancel(subscriptionId, COMPENSATION_VOID_REASON);
        }
        throw err;
      }
    },

    /**
     * Renews an existing subscription under the SAME plan.
     * Cumulative logic: extends currentPeriodEnd from current date.
     */
    async renewSubscription(
      subscriptionId: number,
      data: RenewPlatformSubscriptionPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ newPeriodEnd: Date; paymentId: number }> {
      const sub = await platformSubsRepo.findById(subscriptionId);
      if (!sub) throw new Error('Suscripción no encontrada');
      if (sub.cancelledAt) throw new Error('No se puede renovar una suscripción cancelada');

      // Guard against duplicate pending payments
      const hasPending = await platformSubsRepo.hasPendingPayment(subscriptionId);
      if (hasPending) {
        throw new Error('Ya existe un pago pendiente o en proceso para esta suscripción');
      }

      const plan = await plansRepo.findById(sub.planId);
      if (!plan) throw new Error('Plan no encontrado');

      // Cumulative extension: use currentPeriodEnd if still active, otherwise now
      const baseDate =
        sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
      const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year", 'UTC');

      // Create payment
      const amountPaidCents = data.payment.amountPaidCents ?? plan.price;

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
      // Create payment + extend + emit in a single compensable attempt: if emission
      // fails, payment is voided and moved period is REVERTED to its previous value
      // (`currentPeriodEnd` was read before extending, so compensatory write is honest
      // and needs no transaction). Without `cancelParent`: subscription pre-exists.
      const previousPeriodEnd = sub.currentPeriodEnd;
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        const createdPayment = await platformSubsRepo.createPayment(paymentData);
        paymentCreated = true;
        paymentId = createdPayment.id;

        // Extend period (side effect of payment)
        if (data.payment.status === PAYMENT_STATUSES.VALIDATED) {
          await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
          // Emission (console session != payer: without payer).
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
     * Self-service renewal (org-scoped): registers payment with
     * status `processing` (pending support approval in console) WITHOUT
     * extending the period. All financial data is dictated by backend:
     * plan snapshot (name/price/currency/duration/features), rate via
     * server-side provider and total amount - request body never sends them.
     * Business guards (only on expiry, no pending, not cancelled)
     * are validated in the route; here we only compute and persist.
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

      // Effective price (plan override if applicable) and server-side conversion
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

      // Real payer (renewing org session). `processing` does not number:
      // emission occurs upon validation in `updatePaymentStatus`.
      if (opts?.receipts && opts?.payer) {
        await opts.receipts.setPayerIfMissing(paymentId, opts.payer);
      }

      return { paymentId };
    },

    /**
     * Registers an additional payment on an existing subscription
     * (without automatically renewing the period).
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

      // Registration + extension + issuance in a single compensable attempt: if
      // issuance fails, payment is voided and moved period is REVERTED to
      // `sub.currentPeriodEnd` (read before extending). Subscription
      // pre-exists: no `cancelParent`.
      const previousPeriodEnd = sub.currentPeriodEnd;
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
        const createdPayment = await platformSubsRepo.createPayment(paymentData);
        paymentCreated = true;
        paymentId = createdPayment.id;

        // If validated, extend period
        if (data.status === PAYMENT_STATUSES.VALIDATED) {
          const plan = await plansRepo.findById(sub.planId);
          if (plan) {
            const baseDate =
              sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
            const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year", 'UTC');
            await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
          }
          // Issuance (console session ≠ payer: no payer).
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
      const payments = await platformSubsRepo.countPaymentsBySubscription(id);
      if (payments > 0) {
        // Financial history: a subscription with payments is cancelled, never
        // deleted. The DB-level `RESTRICT` FK is the backstop against races.
        throw subscriptionHasPaymentsError();
      }
      try {
        return await platformSubsRepo.delete(id);
      } catch (err) {
        // TOCTOU backstop: a payment may land between the count and the delete.
        // The `RESTRICT` FK (migrations 0024/0025) is the source of truth, so
        // its violation is surfaced as the SAME business error, never a 500.
        if (isPostgresForeignKeyViolation(err, 'subscription_id')) {
          throw subscriptionHasPaymentsError();
        }
        throw err;
      }
    },

    /* ── Payments ── */

    async getSubscriptionPayments(subscriptionId: number) {
      return platformSubsRepo.findPaymentsBySubscription(subscriptionId);
    },

    async getPaymentById(paymentId: number) {
      return platformSubsRepo.findPaymentById(paymentId);
    },

    /**
     * Changes SaaS payment status and returns void attempt result:
     * internal service THROWS `RECEIPT_NOT_ISSUED` when payment
     * has no number, but the endpoint responds with **200** and
     * `receiptVoided: false` + `receiptVoidReason: 'not_issued'`:
     * silence conveys nothing to operator.
     */
    async updatePaymentStatus(
      paymentId: number,
      data: UpdatePlatformPaymentStatusPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ receiptVoided: boolean; receiptVoidReason?: 'not_issued' }> {
      const payment = await platformSubsRepo.findPaymentById(paymentId);
      if (!payment) throw new Error('Pago no encontrado');
      // RD-156: `validated` and `voided` are the only legal targets (the route
      // enum already rejects the rest; this is the service-level backstop).
      // `* → processing` is the dangerous one: it kept the charge's snapshot and
      // let it be validated again, extending `current_period_end` twice.
      if (
        data.status !== PAYMENT_STATUSES.VALIDATED &&
        data.status !== PAYMENT_STATUSES.VOIDED
      ) {
        throw new HTTPException(400, {
          res: new Response(
            JSON.stringify({
              error: 'Solo se puede validar o anular un pago',
              code: API_ERROR_CODES.PAYMENT_STATUS_TRANSITION_INVALID,
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
        });
      }

      // `wasPending` = was not validated. Re-PATCH to `validated` does not
      // re-extend or renumber (idempotency). Only a `processing` payment
      // can transition to `validated`: `voided` cannot be re-validated
      // (would re-extend period over a voided payment and leave a `validated`
      // without receipt) nor can `refunded` (not produced today, but not legitimate).
      // An idempotent re-void (`voided → voided`) passes through.
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

      // A payment for a cancelled subscription cannot be validated: persisting it
      // would leave a `validated` payment with no number or backing period (invariant:
      // validated ⇔ numbered). Fail-closed BEFORE writing status.
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

      // Void audit ALWAYS persisted in payment (whether receipt exists or not).
      await platformSubsRepo.updatePaymentStatus(paymentId, data.status, {
        voidedBy: opts?.by,
        voidReason: data.voidReason,
      });

      // VOIDED with issued number: preserves number + PDF and marks VOIDED.
      // Without number there is no receipt to void, and that is reported.
      // Only VOIDED: REFUNDED does not touch `receiptVoided`.
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

      // Side effects by status: extend period ONLY on transition to validated,
      // with payment SNAPSHOT duration (not live plan, which could change).
      // Fallback to live plan only if snapshot lacks duration. Subscription cannot
      // be cancelled here (rejected above), so validated payment always gets number.
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
          const newPeriodEnd = addDuration(baseDate, duration.value, duration.unit, 'UTC');
          await platformSubsRepo.updatePeriodEnd(parentSub.id, newPeriodEnd);
        }
        // Issuance only on transition →validated (re-PATCH does not renumber
        // due to attach idempotency; console session ≠ payer: no payer).
        // If it fails, payment (already validated in DB) is voided and moved period
        // is REVERTED to previous value. Without `markPlatformReceiptVoided`:
        // without number there is no receipt to void.
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
  };
}

export type PlatformSubscriptionsService = ReturnType<
  typeof createPlatformSubscriptionsService
>;
