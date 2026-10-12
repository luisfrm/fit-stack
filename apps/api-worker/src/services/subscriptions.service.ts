import type { SubscriptionsRepository, ISubscriptionDTO } from '../repositories/subscriptions.repository';
import type { PaymentsRepository, IPayment } from '../repositories/payments.repository';
import type { PlansRepository } from '../repositories/plans.repository';
import type { MembersRepository } from '../repositories/members.repository';
import { HTTPException } from 'hono/http-exception';
import { OrganizationDateManager } from '../lib/date-manager';
import { COMPENSATION_VOID_REASON, compensateFailedEmission } from '../lib/subscription-compensation';
import {
  PAYMENT_STATUSES,
  computeSubscriptionPeriod,
  toLocalDayString,
  type IPaymentMethodDetails,
  type ITaxDetail,
} from '@workspace/shared';
import { ReceiptError } from './receipts.service';

export type { ISubscriptionDTO } from '../repositories/subscriptions.repository';

export interface ICreateSubscriptionPayload extends Omit<ISubscriptionDTO, 'id' | 'organizationId' | 'startDate' | 'endDate' | 'status' | 'cancelledAt' | 'isActive' | 'createdAt'> {
  /** 'YYYY-MM-DD' local, ISO with `T` or Date. Absent = local today (resolved by server). */
  startDate?: string | Date;
  /** Explicit only for custom period or idempotent; shortening active requires reason. */
  endDate?: string | Date;
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
 * Receipt hooks (step 1 + void). Structural to avoid coupling
 * services: implemented by `createReceiptsService`.
 */
export interface ReceiptHooks {
  assignReceiptNumber(input: {
    orgId: string;
    paymentId: number;
    timezone: string;
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
  timezone?: string;
  by?: string;
  /** Void/rejection reason: persisted in payment and passed to receipt void. */
  voidReason?: string;
}

/**
 * Result of `updatePaymentStatus`.
 *
 * `receiptVoided` is `false` when new status is not `voided` or when payment
 * **had no issued receipt** — and in that second case carries
 * `receiptVoidReason: 'not_issued'`, because internal service throws
 * `RECEIPT_NOT_ISSUED` but endpoint responds with **200**: user needs to
 * distinguish "receipt was voided" from "no receipt existed".
 */
export interface PaymentStatusResult {
  /** Updated `payment` row (route serializes it as-is). */
  payment: IPayment;
  receiptVoided: boolean;
  receiptVoidReason?: 'not_issued';
}

/**
 * Business error with own `res`, same pattern as `409 { code: 'SLUG_TAKEN' }`:
 * the `code` is the contract that apps map to toasts (never arbitrary text).
 */
const businessError = (
  status: 409 | 422,
  code:
    | 'END_DATE_BEFORE_START'
    | 'END_DATE_OVERRIDE_REASON_REQUIRED'
    | 'PAYMENT_NOT_REVALIDATABLE'
    | 'SUBSCRIPTION_CANCELLED',
  message: string,
) =>
  new HTTPException(status, {
    message,
    res: new Response(JSON.stringify({ error: message, code }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  });

/**
 * Resolves a contract date to a UTC instant. Absent/empty falls back to
 * `fallback()`; `'YYYY-MM-DD'` → local midnight; ISO with `T` (or Date) → the
 * instant as-is. A string carrying `T` is honored — never silently replaced.
 */
function parseContractDate(
  value: string | Date | undefined | null,
  dateManager: OrganizationDateManager,
  fallback: () => Date,
): Date {
  if (value === undefined || value === null) return fallback();
  if (value instanceof Date) return value;
  if (value.trim() === '') return fallback();
  return !value.includes('T') ? dateManager.parseLocalToUtc(value) : new Date(value);
}

/**
 * Resolves contract date to UTC instant. Absent/empty = local today;
 * `'YYYY-MM-DD'` → local midnight; ISO with `T` (or Date) → instant as-is.
 */
function parseSubscriptionDate(
  value: string | Date | undefined | null,
  dateManager: OrganizationDateManager,
): Date {
  return parseContractDate(value, dateManager, () =>
    dateManager.parseLocalToUtc(dateManager.getTodayLocalString()),
  );
}

/**
 * `payment.paymentDate` follows the same contract, but absent/empty falls back
 * to "now" (an instant), not local midnight. Before this existed, an ISO
 * date-time was silently dropped and replaced by `new Date()`.
 */
function parsePaymentDate(
  value: string | Date | undefined | null,
  dateManager: OrganizationDateManager,
): Date {
  return parseContractDate(value, dateManager, () => new Date());
}

export function createSubscriptionsService(
  subsRepo: SubscriptionsRepository,
  paymentsRepo: PaymentsRepository,
  plansRepo: PlansRepository,
  membersRepo: MembersRepository
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
        throw new HTTPException(400, { message: 'El plan seleccionado no existe o fue eliminado' });
      }

      const latest = await subsRepo.findLatestForMember(organizationId, payload.memberId);
      if (latest?.paymentStatus === 'processing') {
        throw new HTTPException(400, { message: 'No es posible registrar un nuevo pago mientras el anterior esté pendiente de validación' });
      }

      const dateManager = new OrganizationDateManager(timezone);

      // The server computes the period (Rule 4).
      // 1. `startDate` defaults to local today. 2. `plan` + `latest` are
      // already loaded above (the `processing` guard still runs first).
      const startDate = parseSubscriptionDate(payload.startDate, dateManager);
      if (Number.isNaN(startDate.getTime())) {
        throw new HTTPException(400, { message: 'Fecha de inicio inválida' });
      }

      // 3. Period calculated from cumulative baseline (Phase 1, local day).
      const computed = computeSubscriptionPeriod({
        startDate,
        latestEndDate: latest?.endDate ?? null,
        durationValue: plan.durationValue,
        durationUnit: plan.durationUnit,
        timezone,
      });

      // 4-5. Explicit `endDate`: `endDate < startDate` is rejected; shortening
      // active period requires reason (local day comparison: same day
      // counts as idempotent, not shortening). Idempotent or custom new period
      // → free, NULL reason. Without `endDate` → calculation governs.
      let endDate: Date;
      let endDateOverrideReason: string | null = null;
      if (
        payload.endDate !== undefined &&
        payload.endDate !== null &&
        !(typeof payload.endDate === 'string' && payload.endDate.trim() === '')
      ) {
        const explicitEnd = parseSubscriptionDate(payload.endDate, dateManager);
        if (Number.isNaN(explicitEnd.getTime())) {
          throw new HTTPException(400, { message: 'Fecha de fin inválida' });
        }
        // Local day comparison (consistent with shortening below): an instant
        // `startDate` + 'YYYY-MM-DD' `endDate` of same local day must not
        // be rejected due to instant sub-second order.
        if (toLocalDayString(timezone, explicitEnd) < toLocalDayString(timezone, startDate)) {
          throw businessError(
            422,
            'END_DATE_BEFORE_START',
            'La fecha de fin no puede ser anterior a la fecha de inicio',
          );
        }
        if (
          computed.hasActivePeriod &&
          toLocalDayString(timezone, explicitEnd) < toLocalDayString(timezone, computed.endDate)
        ) {
          const reason =
            typeof payload.endDateOverrideReason === 'string'
              ? payload.endDateOverrideReason.trim()
              : '';
          if (!reason) {
            throw businessError(
              422,
              'END_DATE_OVERRIDE_REASON_REQUIRED',
              'Acortar un periodo vigente exige indicar el motivo',
            );
          }
          endDate = explicitEnd;
          endDateOverrideReason = reason;
        } else {
          endDate = explicitEnd;
          endDateOverrideReason = null;
        }
      } else {
        endDate = computed.endDate;
        endDateOverrideReason = null;
      }

      // Validate the payment instant BEFORE any write: a garbage date must
      // fail with an explicit 400, never leave an orphan subscription behind.
      const paymentDateFinal = parsePaymentDate(payload.payment.paymentDate, dateManager);
      if (Number.isNaN(paymentDateFinal.getTime())) {
        throw new HTTPException(400, { message: 'Fecha de pago inválida' });
      }

      // 6. Persist with reason (column 0019) and proceed with payment + issuance
      // + phase-2 compensation without changes.
      const subscription = await subsRepo.create(organizationId, {
        memberId: payload.memberId,
        planId: payload.planId,
        startDate: startDate,
        endDate: endDate,
        endDateOverrideReason,
      });

      if (!subscription?.id) {
        throw new Error('Error al generar el registro de suscripción');
      }

      // 3-step registration without network transactions (Neon HTTP has no `db.transaction()`):
      // payment + issuance are compensated in `catch` delegating to helper
      // (decision made by re-reading, never by error type).
      let paymentCreated = false;
      let paymentId: number | null = null;
      try {
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
          // Duration snapshot: this was used for the period, so
          // editing the plan later won't rewrite payment semantics.
          planSnapshotDurationValue: plan.durationValue,
          planSnapshotDurationUnit: plan.durationUnit,
          paymentDate: paymentDateFinal,
        });
        paymentCreated = true;
        paymentId = createdPayment?.id ?? null;

        // Automatic issuance upon registering validated payment: step 1 assigns
        // number and enqueues render. Email is enqueued by step 2 upon
        // completing PDF (never here).
        // (Processing payments wait for approval via PATCH /payments/:id/status.)
        //
        // Decision is made against PERSISTED ROW, never against payload:
        // `payment.status` is optional in contract and repo normalizes to
        // `validated`, so reading payload left a validated payment WITHOUT
        // number (and without render) that could only be manually fixed via /issue.
        // Invariant: validated ⇔ numbered, based on DB state.
        if (createdPayment?.id && createdPayment.status === PAYMENT_STATUSES.VALIDATED) {
          // Without `receipts` there is no issuance: wiring error, not normal
          // case. Previously a legacy branch sent email from here without numbering
          // (violating validated ⇔ numbered).
          if (!opts?.receipts) {
            throw new Error(
              'subscriptions.create: opts.receipts es requerido para emitir el comprobante.',
            );
          }
          const p = payload.payment;
          await opts.receipts.assignReceiptNumber({
            orgId: organizationId,
            paymentId: createdPayment.id,
            timezone,
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
        }
      } catch (err) {
        const outcome = await compensateFailedEmission(
          err,
          {
            readPayment: async () => paymentId != null ? paymentsRepo.findById(organizationId, paymentId) : null,
            voidPayment: () =>
              paymentsRepo.updateStatus(organizationId, paymentId as number, 'voided', {
                // `undefined` -> repo persists NULL (same audit trail as
                // `opts?.by ?? null` from spec: without actor, NULL).
                voidedBy: opts?.by,
                voidReason: COMPENSATION_VOID_REASON,
              }),
            cancelParent: () => subsRepo.cancel(organizationId, subscription.id),
          },
          { paymentCreated },
        );
        if (outcome === 'committed') return subscription;
        throw err;
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

      // Mirrors Console guard (validated ⇔ numbered invariant): rejected
      // BEFORE writing a `validated` payment that would lack number or
      // backing period. Only a `processing` payment can be validated —
      // a `voided` cannot be undone (its subscription is already cancelled by
      // the void) — and never on a cancelled subscription.
      const wasPending = previous != null && previous.status !== PAYMENT_STATUSES.VALIDATED;
      if (status === PAYMENT_STATUSES.VALIDATED && wasPending) {
        if (previous!.status !== PAYMENT_STATUSES.PROCESSING) {
          throw businessError(
            409,
            'PAYMENT_NOT_REVALIDATABLE',
            'Solo un pago en proceso puede validarse',
          );
        }
        if (previous!.subscriptionId) {
          const parentSub = await subsRepo.findById(organizationId, previous!.subscriptionId);
          if (parentSub?.cancelledAt) {
            throw businessError(
              409,
              'SUBSCRIPTION_CANCELLED',
              'No se puede validar un pago de una suscripción cancelada',
            );
          }
        }
      }

      // Void audit ALWAYS persisted in payment (whether receipt exists or not):
      // single source of truth for `voidedBy`/`voidedAt`/`voidReason`.
      const updated = await paymentsRepo.updateStatus(organizationId, paymentId, status as any, {
        voidedBy: opts?.by,
        voidReason: opts?.voidReason,
      });
      if (!updated) {
        throw new Error('Registro de pago no encontrado');
      }

      // Voiding/rejecting payment leaves subscription out-of-validity
      // (`cancelledAt`) and derived status becomes `voided` (VOIDED), which is
      // distinct from manual access revocation (`cancelled`).
      if (status === PAYMENT_STATUSES.VOIDED && updated.subscriptionId) {
        await this.cancel(organizationId, updated.subscriptionId);
      }
      // Void with issued number: preserves number + PDF and marks VOIDED.
      // Without issued receipt there is nothing to void, but the result is
      // reported explicitly (C6) rather than swallowing internal error code.
      let receiptVoided = false;
      let receiptVoidReason: PaymentStatusResult['receiptVoidReason'];
      if (status === PAYMENT_STATUSES.VOIDED && opts?.receipts && opts.by) {
        try {
          await opts.receipts.markReceiptVoided({
            orgId: organizationId,
            paymentId,
            by: opts.by,
            reason: opts.voidReason ?? 'Pago anulado',
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

      // A payment transitioning from processing to validated issues its receipt
      // (registration with validated status already numbers in create()).
      if (status === PAYMENT_STATUSES.VALIDATED && wasPending) {
        // Without `receipts` there is no issuance (same rationale as create()):
        // missing service is a wiring error, not normal case.
        if (!opts?.receipts) {
          throw new Error(
            'updatePaymentStatus: opts.receipts es requerido para emitir el comprobante.',
          );
        }
        if (!opts.timezone) {
          throw new Error('updatePaymentStatus: timezone es obligatoria para numerar.');
        }
        await opts.receipts.assignReceiptNumber({
          orgId: organizationId,
          paymentId,
          timezone: opts.timezone,
          actor: opts.by,
        });
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

    // No `delete`: a financial record (subscription + payment) is never deleted.
    // If mistake, voided; if access revoked, cancelled.
  };
}

export type SubscriptionsService = ReturnType<typeof createSubscriptionsService>;
