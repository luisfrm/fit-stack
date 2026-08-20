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
import type { IPaymentMethodDetails } from '@workspace/shared';
import { addDuration } from '../lib/billing-utils';

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

export function createPlatformSubscriptionsService(
  platformSubsRepo: PlatformSubscriptionsRepository,
  plansRepo: ReturnType<typeof createPlatformPlansRepository>
) {
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

    async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
      const sub = await platformSubsRepo.findActiveByOrganization(organizationId);
      if (!sub) return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;
      return sub.computedStatus;
    },

    /* ── Mutations ── */

    /**
     * Crea una nueva plataforma_subscription + su pago inicial (transacción atómica).
     * Soporta planes trial (isTrial=true) y planes free (precio = 0).
     */
    async createSubscriptionWithPayment(
      data: CreatePlatformSubscriptionPayload
    ): Promise<{ subscriptionId: number }> {
      const plan = await plansRepo.findById(data.planId);
      if (!plan) throw new Error('Plan no encontrado');

      const startDate = parseStartDate(data.startDate);
      const isTrial = data.isTrial ?? false;

      // Free plan: validar precio 0
      if (!isTrial && plan.price === 0) {
        // Para planes free, forzar status=validated
      }

      // Trial: usar trialDays del plan si existen, sino duración del plan
      const trialDays = plan.trialDays ?? 0;
      const currentPeriodEnd = isTrial && trialDays > 0
        ? addDuration(startDate, trialDays, 'day')
        : addDuration(startDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year");

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
        amountPaid: amountPaidCents,
        currencyPaid: data.payment.currencyPaid || plan.currency,
        exchangeRateApplied: data.payment.exchangeRateApplied ?? null,
        baseAmount: data.payment.baseAmountCents ?? null,
        paymentMethod,
        paymentMethodDetails: data.payment.paymentMethodDetails ?? null,
        status: paymentStatus,
        paymentDate: data.payment.paymentDate
          ? new Date(data.payment.paymentDate)
          : new Date(),
      };
      await platformSubsRepo.createPayment(paymentData);

      return { subscriptionId };
    },

    /**
     * Renueva una suscripción existente bajo el MISMO plan.
     * Lógica acumulativa: extiende currentPeriodEnd desde la fecha actual.
     */
    async renewSubscription(
      subscriptionId: number,
      data: RenewPlatformSubscriptionPayload
    ): Promise<{ newPeriodEnd: Date }> {
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
        amountPaid: amountPaidCents,
        currencyPaid: data.payment.currencyPaid || plan.currency,
        exchangeRateApplied: data.payment.exchangeRateApplied ?? null,
        baseAmount: data.payment.baseAmountCents ?? null,
        paymentMethod: data.payment.paymentMethod,
        paymentMethodDetails: data.payment.paymentMethodDetails ?? null,
        status: data.payment.status,
        paymentDate: data.payment.paymentDate
          ? new Date(data.payment.paymentDate)
          : new Date(),
      };
      await platformSubsRepo.createPayment(paymentData);

      // Extender periodo (side effect del pago)
      if (data.payment.status === PAYMENT_STATUSES.VALIDATED) {
        await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
      }

      return { newPeriodEnd };
    },

    /**
     * Cambia el plan de una organización: cancela el actual y crea uno nuevo.
     */
    async changePlan(
      organizationId: string,
      data: ChangePlatformPlanPayload
    ): Promise<{ subscriptionId: number }> {
      const current = await platformSubsRepo.findActiveByOrganization(organizationId);

      // Cancelar suscripción actual (si existe y no está cancelada)
      if (current && !current.cancelledAt) {
        await platformSubsRepo.cancel(current.id, 'Plan cambiado');
      }

      // Crear nueva suscripción
      return this.createSubscriptionWithPayment({
        organizationId,
        planId: data.newPlanId,
        isTrial: data.isTrial,
        priceOverrideCents: data.priceOverrideCents,
        payment: data.payment,
      });
    },

    /**
     * Registra un pago adicional sobre una suscripción existente
     * (sin renovar automáticamente el periodo).
     */
    async registerPayment(
      subscriptionId: number,
      data: PlatformPaymentPayload
    ): Promise<{ paymentId: number }> {
      const sub = await platformSubsRepo.findById(subscriptionId);
      if (!sub) throw new Error('Suscripción no encontrada');
      if (sub.cancelledAt) throw new Error('No se puede registrar un pago en una suscripción cancelada');

      const hasPending = await platformSubsRepo.hasPendingPayment(subscriptionId);
      if (hasPending && (data.status === PAYMENT_STATUSES.PENDING || data.status === PAYMENT_STATUSES.PROCESSING)) {
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
        amountPaid: data.amountPaidCents,
        currencyPaid: data.currencyPaid,
        exchangeRateApplied: data.exchangeRateApplied ?? null,
        baseAmount: data.baseAmountCents ?? null,
        paymentMethod: data.paymentMethod,
        paymentMethodDetails: data.paymentMethodDetails ?? null,
        status: data.status,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      };

      const { id: paymentId } = await platformSubsRepo.createPayment(paymentData);

      // Si se valida, extender el periodo
      if (data.status === PAYMENT_STATUSES.VALIDATED) {
        const plan = await plansRepo.findById(sub.planId);
        if (plan) {
          const baseDate =
            sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
          const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year");
          await platformSubsRepo.updatePeriodEnd(subscriptionId, newPeriodEnd);
        }
      }

      return { paymentId };
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

    async updatePaymentStatus(
      paymentId: number,
      data: UpdatePlatformPaymentStatusPayload
    ): Promise<void> {
      const payment = await platformSubsRepo.findPaymentById(paymentId);
      if (!payment) throw new Error('Pago no encontrado');

      await platformSubsRepo.updatePaymentStatus(paymentId, data.status);

      // Side effects según nuevo status
      if (data.status === PAYMENT_STATUSES.VALIDATED && payment.subscriptionId) {
        const sub = await platformSubsRepo.findById(payment.subscriptionId);
        const plan = await plansRepo.findById(payment.planId);
        if (sub && plan && !sub.cancelledAt) {
          const baseDate =
            sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
          const newPeriodEnd = addDuration(baseDate, plan.durationValue, plan.durationUnit as "day" | "week" | "month" | "year");
          await platformSubsRepo.updatePeriodEnd(sub.id, newPeriodEnd);
        }
      }
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
    }): PlatformSubscriptionStatus {
      return computePlatformSubscriptionStatus({
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelledAt: sub.cancelledAt,
        isTrial: sub.isTrial,
      });
    },
  };
}

export type PlatformSubscriptionsService = ReturnType<
  typeof createPlatformSubscriptionsService
>;
