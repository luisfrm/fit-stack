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
import { normalizeFeatures, addDuration, API_ERROR_CODES, roundCents } from '@workspace/shared';
import { HTTPException } from 'hono/http-exception';
import type { ExchangeRateProvider } from '../lib/exchange-rates';
import type { PlatformSettingsRepository } from '../repositories/platform-settings.repository';
import type { PlatformReceiptContext } from './platform-receipts.service';
import { ReceiptError } from './receipts.service';
import {
  COMPENSATION_VOID_REASON,
  compensateFailedEmission,
} from '../lib/subscription-compensation';
import { isPostgresForeignKeyViolation, requireVoidReasonOrThrow } from '../lib/errors';

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
  payment: PlatformPaymentPayload;
}

/**
 * Payment inputs accepted from the operator. Amounts and rates are NOT part of
 * the contract: the server prices every SaaS payment (`pricePlatformPayment`).
 */
export interface PlatformPaymentPayload {
  currencyPaid: string;
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
  platformSettingsRepo: PlatformSettingsRepository,
  rateProvider: ExchangeRateProvider = SAME_CURRENCY_ONLY_RATE_PROVIDER
) {
  /**
   * Reference currency of the platform (`platform_setting.primary_currency`).
   * Resolved per call: a missing setting is a visible error, never a default.
   */
  const primaryCurrency = () => platformSettingsRepo.getPrimaryCurrency();

  /**
   * Server-side pricing of a SaaS payment — SINGLE place for the amounts.
   *
   * - `amountPaid` = plan price converted to the paid currency.
   * - `platformAmount` = plan price converted to
   *   `platform_setting.primary_currency`, the currency every SaaS report/
   *   receipt reads. Both rates are persisted, so no read-time division.
   * - A `price = 0` plan is the free path: zero amounts, no rates, `free`
   *   method (decided by the caller).
   *
   * Request bodies never state an amount or a rate: they are derived from the
   * plan and the rate provider (typed failures map to 503/400 by the route).
   */
  async function pricePlatformPayment(input: {
    planPrice: number;
    planCurrency: string;
    currencyPaid: string;
    primaryCurrency: string;
  }): Promise<{
    amountPaid: number;
    exchangeRateApplied: string | null;
    platformRateApplied: string | null;
    platformAmount: number;
    isFreePlan: boolean;
  }> {
    if (input.planPrice === 0) {
      return {
        amountPaid: 0,
        exchangeRateApplied: null,
        platformRateApplied: null,
        platformAmount: 0,
        isFreePlan: true,
      };
    }
    // The payment is already in the primary currency: both hops are the SAME
    // rate, so it is quoted once (the plan->primary conversion is an identity).
    if (input.currencyPaid === input.primaryCurrency) {
      const rate = await rateProvider.getRate(
        input.planCurrency,
        input.currencyPaid,
      );
      return {
        amountPaid: roundCents(input.planPrice * rate),
        exchangeRateApplied: String(rate),
        platformRateApplied: String(rate),
        platformAmount: roundCents(input.planPrice * rate),
        isFreePlan: false,
      };
    }
    const [planToPaid, planToPrimary] = await Promise.all([
      rateProvider.getRate(input.planCurrency, input.currencyPaid),
      rateProvider.getRate(input.planCurrency, input.primaryCurrency),
    ]);
    return {
      amountPaid: roundCents(input.planPrice * planToPaid),
      exchangeRateApplied: String(planToPaid),
      platformRateApplied: String(planToPrimary),
      platformAmount: roundCents(input.planPrice * planToPrimary),
      isFreePlan: false,
    };
  }

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
      return platformSubsRepo.getStats(await primaryCurrency());
    },

    async getRevenue(months: number) {
      return platformSubsRepo.getMonthlyRevenue(await primaryCurrency(), months);
    },

    async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
      const sub = await platformSubsRepo.findActiveByOrganization(organizationId);
      if (!sub) return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;
      return sub.status;
    },

    /* ── Mutations ── */

    /**
     * Creates a new platform_subscription + initial payment (atomic transaction).
     * A plan priced at 0 uses the free path (validated `$0` payment with
     * `payment_method = 'free'`). Every amount is priced by the server.
     */
    async createSubscriptionWithPayment(
      data: CreatePlatformSubscriptionPayload,
      opts?: PlatformReceiptContext
    ): Promise<{ subscriptionId: number; paymentId: number }> {
      const plan = await plansRepo.findById(data.planId);
      if (!plan) throw new Error('Plan no encontrado');

      const startDate = parseStartDate(data.startDate);

      // Server-priced payment: plan -> paid currency and plan -> platform
      // primary currency. A free plan (price 0) books zeros and no rates.
      const priced = await pricePlatformPayment({
        planPrice: plan.price,
        planCurrency: plan.currency,
        currencyPaid: data.payment.currencyPaid,
        primaryCurrency: await primaryCurrency(),
      });

      // A free plan (price 0) forces status=validated with paymentMethod='free'.
      // Its snapshot price is already 0, so it never books revenue.
      let paymentStatus = data.payment.status;
      let paymentMethod = data.payment.paymentMethod;
      if (priced.isFreePlan) {
        paymentStatus = PAYMENT_STATUSES.VALIDATED;
        paymentMethod = 'free';
      }

      // Point 7(a): period is only front-loaded if registration is born paid.
      // A registration `processing`/`voided`/`refunded` does NOT grant free time:
      // `currentPeriodEnd = startDate` until validated (where PATCH extends
      // it using snapshot). A free plan forces `validated` above.
      let currentPeriodEnd = startDate;
      if (paymentStatus === PAYMENT_STATUSES.VALIDATED) {
        currentPeriodEnd = addDuration(
          startDate,
          plan.durationValue,
          plan.durationUnit as 'day' | 'week' | 'month' | 'year',
          'UTC'
        );
      }

      // 1. Create subscription
      const newSubData: NewPlatformSubscriptionData = {
        organizationId: data.organizationId,
        planId: data.planId,
        startDate,
        currentPeriodEnd,
      };
      const { id: subscriptionId } = await platformSubsRepo.create(newSubData);

      // Registration in 2 steps without network (Neon HTTP lacks `db.transaction()`):
      // payment + emission are compensated in `catch` delegating to helper
      // (decision by re-read, never by error type). SaaS semantics:
      // a registration left without valid payment also cancels subscription with
      // `cancel()` - never `delete()` (rule 6): a `voided` payment is ignored in
      // SaaS compute and would leave a front-loaded period without backing payment.
      // Free $0 (`skipped:true`) = success, no compensation needed.
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
          amountPaid: priced.amountPaid,
          currencyPaid: data.payment.currencyPaid,
          exchangeRateApplied: priced.exchangeRateApplied,
          platformRateApplied: priced.platformRateApplied,
          platformAmount: priced.platformAmount,
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

        // Emission: step 1 numbers where payment is validated (free $0 SKIP
        // inside service). Console session != payer:
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

      // Server-priced payment (plan -> paid currency and -> primary currency).
      const priced = await pricePlatformPayment({
        planPrice: plan.price,
        planCurrency: plan.currency,
        currencyPaid: data.payment.currencyPaid,
        primaryCurrency: await primaryCurrency(),
      });

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
        amountPaid: priced.amountPaid,
        currencyPaid: data.payment.currencyPaid,
        exchangeRateApplied: priced.exchangeRateApplied,
        platformRateApplied: priced.platformRateApplied,
        platformAmount: priced.platformAmount,
        paymentMethod: priced.isFreePlan ? 'free' : data.payment.paymentMethod,
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

      // Server-side conversion: the charge is priced from the plan and the rate
      // provider; the request body never states amounts.
      const priced = await pricePlatformPayment({
        planPrice: plan.price,
        planCurrency: plan.currency,
        currencyPaid: data.currencyPaid,
        primaryCurrency: await primaryCurrency(),
      });

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
        amountPaid: priced.amountPaid,
        currencyPaid: data.currencyPaid,
        exchangeRateApplied: priced.exchangeRateApplied,
        platformRateApplied: priced.platformRateApplied,
        platformAmount: priced.platformAmount,
        paymentMethod: priced.isFreePlan ? 'free' : data.paymentMethod,
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

      // Server-priced payment from the live plan (the snapshot below freezes it).
      const priced = await pricePlatformPayment({
        planPrice: sub.planPrice,
        planCurrency: sub.planCurrency,
        currencyPaid: data.currencyPaid,
        primaryCurrency: await primaryCurrency(),
      });

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
        amountPaid: priced.amountPaid,
        currencyPaid: data.currencyPaid,
        exchangeRateApplied: priced.exchangeRateApplied,
        platformRateApplied: priced.platformRateApplied,
        platformAmount: priced.platformAmount,
        paymentMethod: priced.isFreePlan ? 'free' : data.paymentMethod,
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

      // RD-163: a `voided` decision must carry its reason — resolved before the
      // first write, so a PATCH without it leaves the payment untouched.
      const decision: { voided: true; voidReason: string } | { voided: false } =
        data.status === PAYMENT_STATUSES.VOIDED
          ? { voided: true, voidReason: requireVoidReasonOrThrow(data.voidReason) }
          : { voided: false };

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
        voidReason: decision.voided ? decision.voidReason : undefined,
      });

      // VOIDED with issued number: preserves number + PDF and marks VOIDED.
      // Without number there is no receipt to void, and that is reported.
      // Only VOIDED: REFUNDED does not touch `receiptVoided`.
      let receiptVoided = false;
      let receiptVoidReason: 'not_issued' | undefined;
      if (decision.voided && opts?.receipts && opts.by) {
        try {
          await opts.receipts.markPlatformReceiptVoided({
            paymentId,
            by: opts.by,
            reason: decision.voidReason,
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
