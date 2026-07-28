import type { SubscriptionsRepository, ISubscriptionDTO, SubscriptionsFilter } from '../repositories/subscriptions.repository';
import type { PaymentsRepository } from '../repositories/payments.repository';
import type { PlansRepository } from '../repositories/plans.repository';
import { OrganizationDateManager } from '../lib/date-manager';
import { PAYMENT_STATUSES } from '@workspace/shared';

export type { ISubscriptionDTO } from '../repositories/subscriptions.repository';

export interface ICreateSubscriptionPayload extends Omit<ISubscriptionDTO, 'id' | 'organizationId'> {
  payment: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string | null;
    paymentMethod: string;
    paymentMethodDetails?: Record<string, any> | null;
    status?: string;
    paymentDate?: string | Date;
  };
}

export function createSubscriptionsService(
  subsRepo: SubscriptionsRepository,
  paymentsRepo: PaymentsRepository,
  plansRepo: PlansRepository,
  taskQueue?: Queue
) {
  return {
    async getAllPaginated(organizationId: string, filters: any) {
      const utcNow = new Date();
      const result = await subsRepo.findAllPaginated(
        {
          ...filters,
          organizationId,
        },
        utcNow
      );

      return {
        ...result,
        data: result.data.map((r: any) => ({
          ...r,
          memberName: `${r.memberName} ${r.memberLastName}`,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          paymentDate: r.paymentDate?.toISOString(),
        })),
      };
    },

    async getAllVisible(organizationId: string) {
      const utcNow = new Date();
      const records = await subsRepo.findAllVisible(organizationId, utcNow);

      return records.map((r: any) => ({
        ...r,
        memberName: `${r.memberName} ${r.memberLastName}`,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        paymentDate: r.paymentDate?.toISOString(),
      }));
    },

    async getRecent(organizationId: string, limit: number) {
      const records = await subsRepo.findRecent(organizationId, limit);
      return records.map((r: any) => ({
        id: r.id,
        name: `${r.memberName} ${r.memberLastName}`,
        imageUrl: r.memberImageUrl,
        createdAt: r.createdAt.toISOString(),
        planName: r.planName || null,
        amountPaid: r.amountPaid ? Number(r.amountPaid) : null,
        currencyPaid: r.currencyPaid || 'USD',
        endDate: r.endDate.toISOString(),
      }));
    },

    async create(organizationId: string, payload: ICreateSubscriptionPayload, timezone?: string) {
      const plan = await plansRepo.findById(organizationId, payload.planId);
      if (!plan) {
        throw new Error('El plan seleccionado no existe');
      }

      const latest = await subsRepo.findLatestForMember(organizationId, payload.memberId);
      if (latest?.paymentStatus === 'processing') {
        throw new Error('No es posible registrar un nuevo pago mientras el anterior esté pendiente de validación');
      }

      const dateManager = new OrganizationDateManager(timezone || 'America/Caracas');

      const startStr = payload.startDate as unknown as string;
      const startDate =
        typeof startStr === 'string' && !startStr.includes('T')
          ? dateManager.parseLocalToUtc(startStr)
          : new Date(payload.startDate);

      const endStr = payload.endDate as unknown as string;
      const endDate =
        typeof endStr === 'string' && !endStr.includes('T')
          ? dateManager.parseLocalToUtc(endStr)
          : new Date(payload.endDate);

      const subscription = await subsRepo.create(organizationId, {
        memberId: payload.memberId,
        planId: payload.planId,
        startDate: startDate,
        endDate: endDate,
      });

      if (!subscription?.id) {
        throw new Error('Error al generar el registro de suscripción');
      }

      let paymentDateFinal: Date;
      if (
        payload.payment.paymentDate &&
        typeof payload.payment.paymentDate === 'string' &&
        !payload.payment.paymentDate.includes('T')
      ) {
        paymentDateFinal = dateManager.parseLocalToUtc(payload.payment.paymentDate);
      } else {
        paymentDateFinal = new Date();
      }

      await paymentsRepo.create(organizationId, {
        memberId: payload.memberId,
        subscriptionId: subscription.id,
        planSnapshotName: plan.name,
        planSnapshotPrice: plan.price.toString(),
        planSnapshotCurrency: plan.currency,
        amountPaid: payload.payment.amountPaid,
        currencyPaid: payload.payment.currencyPaid,
        exchangeRateApplied: payload.payment.exchangeRateApplied,
        paymentMethod: payload.payment.paymentMethod,
        paymentMethodDetails: payload.payment.paymentMethodDetails,
        status: payload.payment.status as any,
        paymentDate: paymentDateFinal,
      });

      return subscription;
    },

    async updatePaymentStatus(organizationId: string, paymentId: number, status: string) {
      const updated = await paymentsRepo.updateStatus(organizationId, paymentId, status as any);
      if (!updated) {
        throw new Error('Registro de pago no encontrado');
      }

      if ((status === PAYMENT_STATUSES.VOIDED || status === PAYMENT_STATUSES.INVALID) && updated.subscriptionId) {
        await this.cancel(organizationId, updated.subscriptionId);
      }

      return updated;
    },

    async cancel(organizationId: string, id: number) {
      const updated = await subsRepo.cancel(organizationId, id);
      if (!updated) {
        throw new Error('Suscripción no encontrada');
      }
      return updated;
    },

    async delete(organizationId: string, id: number): Promise<void> {
      await subsRepo.delete(organizationId, id);
    },

    async sendReceiptEmail(organizationId: string, paymentId: number) {
      if (taskQueue) {
        await taskQueue.send({
          type: 'email.payment_receipt',
          paymentId,
          organizationId,
        });
        return { success: true, queued: true };
      }
      return { success: false, error: 'Task queue not available' };
    },
  };
}

export type SubscriptionsService = ReturnType<typeof createSubscriptionsService>;
