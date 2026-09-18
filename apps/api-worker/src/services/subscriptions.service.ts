import type { SubscriptionsRepository, ISubscriptionDTO, SubscriptionsFilter } from '../repositories/subscriptions.repository';
import type { PaymentsRepository } from '../repositories/payments.repository';
import type { PlansRepository } from '../repositories/plans.repository';
import type { MembersRepository } from '../repositories/members.repository';
import { HTTPException } from 'hono/http-exception';
import { OrganizationDateManager } from '../lib/date-manager';
import { PAYMENT_STATUSES, type IPaymentMethodDetails, type ITaxDetail } from '@workspace/shared';
import { ReceiptError } from './receipts.service';

export type { ISubscriptionDTO } from '../repositories/subscriptions.repository';

export interface ICreateSubscriptionPayload extends Omit<ISubscriptionDTO, 'id' | 'organizationId'> {
  payment: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string | null;
    paymentMethod: string;
    paymentMethodDetails?: IPaymentMethodDetails | null;
    status?: string;
    paymentDate?: string | Date;
    subtotal?: number;
    taxTotal?: number;
    taxDetails?: ITaxDetail[];
    taxOverrideReason?: string;
  };
}

/**
 * Hooks de comprobantes (paso 1 + void). Estructural para no acoplar
 * servicios: lo implementa `createReceiptsService`.
 */
export interface ReceiptHooks {
  assignReceiptNumber(input: {
    orgId: string;
    paymentId: number;
    timezone: string;
    orgSlug?: string | null;
    actor?: string;
    taxOverride?: {
      subtotal: number;
      taxTotal: number;
      taxDetails: ITaxDetail[];
      taxOverrideReason: string;
    } | null;
  }): Promise<{ receiptNumber: string; pdfStatus: 'pending' | 'ready' }>;
  markReceiptVoided(input: {
    orgId: string;
    paymentId: number;
    by: string;
    reason: string;
  }): Promise<unknown>;
}

export interface ReceiptContext {
  receipts?: ReceiptHooks;
  orgSlug?: string | null;
  timezone?: string;
  by?: string;
}

/**
 * Resultado de `updatePaymentStatus`.
 *
 * `receiptVoided` es `false` cuando el nuevo status no es `voided` o cuando el
 * pago **no tenía comprobante emitido** — y en ese segundo caso viaja
 * `receiptVoidReason: 'not_issued'`, porque el servicio interno lanza
 * `RECEIPT_NOT_ISSUED` pero el endpoint responde **200**: el usuario tiene que
 * poder distinguir "se anuló el comprobante" de "no había comprobante".
 */
export interface PaymentStatusResult {
  /** Fila `payment` actualizada (el route la serializa tal cual). */
  payment: any;
  receiptVoided: boolean;
  receiptVoidReason?: 'not_issued';
}

export function createSubscriptionsService(
  subsRepo: SubscriptionsRepository,
  paymentsRepo: PaymentsRepository,
  plansRepo: PlansRepository,
  membersRepo: MembersRepository,
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
        currencyPaid: r.currencyPaid,
        endDate: r.endDate.toISOString(),
      }));
    },

    async create(
      organizationId: string,
      payload: ICreateSubscriptionPayload,
      timezone: string,
      opts?: ReceiptContext,
    ) {
      const member = await membersRepo.findById(organizationId, payload.memberId);
      if (!member) {
        throw new HTTPException(400, { message: 'El miembro seleccionado no existe' });
      }

      const plan = await plansRepo.findById(organizationId, payload.planId);
      if (!plan) {
        throw new HTTPException(400, { message: 'El plan seleccionado no existe' });
      }

      const latest = await subsRepo.findLatestForMember(organizationId, payload.memberId);
      if (latest?.paymentStatus === 'processing') {
        throw new HTTPException(400, { message: 'No es posible registrar un nuevo pago mientras el anterior esté pendiente de validación' });
      }

      const dateManager = new OrganizationDateManager(timezone);

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

      const createdPayment = await paymentsRepo.create(organizationId, {
        memberId: payload.memberId,
        subscriptionId: subscription.id,
        planSnapshotName: plan.name,
        planSnapshotPrice: plan.price,
        planSnapshotCurrency: plan.currency,
        amountPaid: payload.payment.amountPaid,
        currencyPaid: payload.payment.currencyPaid,
        exchangeRateApplied: payload.payment.exchangeRateApplied,
        paymentMethod: payload.payment.paymentMethod,
        paymentMethodDetails: payload.payment.paymentMethodDetails,
        status: payload.payment.status as any,
        paymentDate: paymentDateFinal,
      });

      // Emisión automática al registrar un pago validado: el paso 1 asigna
      // el número y encola el render. El email lo encola el paso 2 al
      // completar el PDF (nunca aquí). Sin receipts inyectado (tests
      // directos del servicio) se conserva el envío legacy.
      // (Los processing esperan la aprobación en PATCH /payments/:id/status.)
      if (createdPayment?.id && payload.payment.status === PAYMENT_STATUSES.VALIDATED) {
        if (opts?.receipts) {
          const p = payload.payment;
          await opts.receipts.assignReceiptNumber({
            orgId: organizationId,
            paymentId: createdPayment.id,
            timezone,
            orgSlug: opts.orgSlug,
            actor: opts.by,
            taxOverride:
              p.taxTotal !== undefined && p.taxDetails !== undefined
                ? {
                    subtotal: p.subtotal ?? p.amountPaid,
                    taxTotal: p.taxTotal,
                    taxDetails: p.taxDetails,
                    taxOverrideReason: p.taxOverrideReason ?? '',
                  }
                : null,
          });
        } else if (taskQueue) {
          await taskQueue.send({
            type: 'email.payment_receipt',
            paymentId: createdPayment.id,
            organizationId,
          });
        }
      }

      return subscription;
    },

    async updatePaymentStatus(
      organizationId: string,
      paymentId: number,
      status: string,
      opts?: ReceiptContext,
    ): Promise<PaymentStatusResult> {
      const previous = await paymentsRepo.findById(organizationId, paymentId);
      const updated = await paymentsRepo.updateStatus(organizationId, paymentId, status as any);
      if (!updated) {
        throw new Error('Registro de pago no encontrado');
      }

      // Anular/rechazar el cobro deja la suscripción fuera de vigencia
      // (`cancelledAt`) y el status derivado pasa a `voided` (ANULADA), que es
      // distinto de revocar el acceso a mano (`cancelled`).
      if ((status === PAYMENT_STATUSES.VOIDED || status === PAYMENT_STATUSES.INVALID) && updated.subscriptionId) {
        await this.cancel(organizationId, updated.subscriptionId);
      }
      // Void con número emitido: conserva número + PDF y marca ANULADO.
      // Sin comprobante emitido no hay nada que anular, pero el resultado se
      // informa explícitamente (C6) en vez de tragarse el código del servicio.
      let receiptVoided = false;
      let receiptVoidReason: PaymentStatusResult['receiptVoidReason'];
      if (status === PAYMENT_STATUSES.VOIDED && opts?.receipts && opts.by) {
        try {
          await opts.receipts.markReceiptVoided({
            orgId: organizationId,
            paymentId,
            by: opts.by,
            reason: 'Pago anulado',
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

      // Un pago que pasa de processing/pending a validated emite su recibo
      // (el alta con status validated ya lo numera en create()).
      const wasPending = previous && previous.status !== PAYMENT_STATUSES.VALIDATED;
      if (status === PAYMENT_STATUSES.VALIDATED && wasPending) {
        if (opts?.receipts) {
          if (!opts.timezone) {
            throw new Error('updatePaymentStatus: timezone es obligatoria para numerar.');
          }
          await opts.receipts.assignReceiptNumber({
            orgId: organizationId,
            paymentId,
            timezone: opts.timezone,
            orgSlug: opts.orgSlug,
            actor: opts.by,
          });
        } else if (taskQueue) {
          await taskQueue.send({
            type: 'email.payment_receipt',
            paymentId,
            organizationId,
          });
        }
      }

      return { payment: updated, receiptVoided, receiptVoidReason };
    },

    async updateStatus(organizationId: string, id: number, status: 'active' | 'cancelled') {
      const updated = await subsRepo.updateStatus(organizationId, id, status);
      return updated;
    },

    async cancel(organizationId: string, id: number) {
      const updated = await subsRepo.cancel(organizationId, id);
      if (!updated) {
        throw new Error('Suscripción no encontrada');
      }
      return updated;
    },

    // Sin `delete`: un registro financiero (suscripción + pago) no se elimina
    // nunca. Si está equivocado se anula, si se revoca el acceso se cancela.
  };
}

export type SubscriptionsService = ReturnType<typeof createSubscriptionsService>;
