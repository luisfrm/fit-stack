/**
 * RD-158 — the server prices a subscription payment.
 *
 * `amountPaid` and `exchangeRateApplied` left the write contract: a cashier
 * could otherwise state them and the receipt would lie. With stubbed
 * repositories (no DB) this freezes:
 *
 *   - `amountPaid = roundCents(plan.price * rate)` and the rate persisted as
 *     the provider returned it (never a client-stated value);
 *   - a currency outside `active_currencies` → 400 `PAYMENT_CURRENCY_NOT_ACTIVE`
 *     before any write;
 *   - a missing money dependency is a visible wiring error, never a silently
 *     persisted client amount.
 *
 * The HTTP contract (client values ignored) is covered over real HTTP in
 * `integration/subscriptions.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { createSubscriptionsService } from '../../src/services/subscriptions.service';
import type { PaymentStatusResult } from '../../src/services/subscriptions.service';
import type { PaymentsRepository } from '../../src/repositories/payments.repository';
import type { SubscriptionsRepository } from '../../src/repositories/subscriptions.repository';
import type { PlansRepository } from '../../src/repositories/plans.repository';
import type { MembersRepository } from '../../src/repositories/members.repository';

type CreateArg = Parameters<PaymentsRepository['create']>[1];

const PLAN = {
  id: 3,
  organizationId: 'org-1',
  name: 'Plan Mensual',
  price: 10000,
  currency: 'USD',
  durationValue: 1,
  durationUnit: 'month',
};

const PAYLOAD = {
  memberId: 5,
  planId: PLAN.id,
  payment: {
    currencyPaid: 'VES',
    paymentMethod: 'cash',
    paymentMethodDetails: [],
    status: 'validated',
  },
};

interface HarnessOptions {
  /** Stored `gym_setting.active_currencies` (`null` = row absent). */
  activeCurrencies?: string | null;
  rate?: number;
}

/** Service wired with stubs: only the write path that prices the payment. */
function buildService({ activeCurrencies = '["VES","USD"]', rate = 36.5432 }: HarnessOptions = {}) {
  const membersRepo = {
    findById: vi.fn(async () => ({ id: PAYLOAD.memberId, organizationId: 'org-1' })),
  };
  const plansRepo = { findById: vi.fn(async () => PLAN) };
  const subsRepo = {
    findLatestForMember: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 11 })),
    cancel: vi.fn(async () => ({ id: 11 })),
  };
  const paymentsRepo = {
    create: vi.fn(async (_organizationId: string, data: CreateArg) => ({
      id: 21,
      ...data,
    })),
    // `updatePaymentStatus` only: keeps the stub honest about what `create` uses.
    updateStatus: vi.fn(async (): Promise<PaymentStatusResult['payment']> => {
      throw new Error('not used');
    }),
  };
  const settingsRepo = {
    findByKey: vi.fn(async () => activeCurrencies ?? undefined),
  };
  const getRate = vi.fn(async () => rate);

  const service = createSubscriptionsService(
    subsRepo as unknown as SubscriptionsRepository,
    paymentsRepo as unknown as PaymentsRepository,
    plansRepo as unknown as PlansRepository,
    membersRepo as unknown as MembersRepository,
    { rateProvider: { getRate }, settingsRepo },
  );
  const receipts = {
    assignReceiptNumber: vi.fn(async () => ({ receiptNumber: '2026-1', pdfStatus: 'pending' as const })),
    markReceiptVoided: vi.fn(async () => undefined),
  };

  return { service, paymentsRepo, subsRepo, getRate, receipts };
}

async function captureHttpError(promise: Promise<unknown>): Promise<HTTPException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HTTPException) return error;
    throw error;
  }
  throw new Error('Expected the service to reject');
}

describe('subscriptions.create — server-side pricing (RD-158)', () => {
  it('derives `amountPaid` and the applied rate from the plan and the provider', async () => {
    const { service, paymentsRepo, getRate, receipts } = buildService({ rate: 36.5432 });

    await service.create('org-1', PAYLOAD, 'America/Caracas', {
      receipts,
      by: 'user-1',
    });

    // 10000 cents * 36.5432 = 365432 cents (exact, no float drift here).
    expect(getRate).toHaveBeenCalledWith(PLAN.currency, 'VES');
    expect(paymentsRepo.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        amountPaid: 365432,
        currencyPaid: 'VES',
        exchangeRateApplied: '36.5432',
        planSnapshotPrice: PLAN.price,
        planSnapshotCurrency: PLAN.currency,
      }),
    );
  });

  it('rounds the converted amount with `roundCents` (never a raw float)', async () => {
    const { service, paymentsRepo, receipts } = buildService({ rate: 0.3333 });

    await service.create('org-1', PAYLOAD, 'America/Caracas', { receipts });

    // 10000 * 0.3333 = 3333 exactly; a fractional rate must still land on an integer.
    const [, data] = paymentsRepo.create.mock.calls[0]!;
    expect(Number.isInteger(data.amountPaid)).toBe(true);
    expect(data.amountPaid).toBe(3333);
    expect(data.exchangeRateApplied).toBe('0.3333');
  });

  it('ignores client-stated money: the payload does not carry it', async () => {
    const { service, paymentsRepo, receipts } = buildService({ rate: 2 });
    // Extra properties (an old client or a hand-rolled call) must never win.
    const withClientMoney = {
      ...PAYLOAD,
      payment: { ...PAYLOAD.payment, amountPaid: 1, exchangeRateApplied: '0.0001' },
    };

    await service.create('org-1', withClientMoney, 'America/Caracas', { receipts });

    const [, data] = paymentsRepo.create.mock.calls[0]!;
    expect(data.amountPaid).toBe(20000);
    expect(data.exchangeRateApplied).toBe('2');
  });

  it('rejects a currency outside `active_currencies` with 400 and writes nothing', async () => {
    const { service, paymentsRepo, subsRepo, getRate } = buildService({
      activeCurrencies: '["USD"]',
    });

    const error = await captureHttpError(
      service.create('org-1', PAYLOAD, 'America/Caracas'),
    );

    expect(error.status).toBe(400);
    expect(await error.res?.clone().json()).toMatchObject({
      code: 'PAYMENT_CURRENCY_NOT_ACTIVE',
    });
    // The rate is never requested for a currency the org cannot charge in.
    expect(getRate).not.toHaveBeenCalled();
    expect(subsRepo.create).not.toHaveBeenCalled();
    expect(paymentsRepo.create).not.toHaveBeenCalled();
  });

  it('fails visibly when `active_currencies` is absent (no guessed list)', async () => {
    const { service, paymentsRepo } = buildService({ activeCurrencies: null });

    const error = await captureHttpError(
      service.create('org-1', PAYLOAD, 'America/Caracas'),
    );

    expect(error.status).toBe(400);
    expect(await error.res?.clone().json()).toMatchObject({
      code: 'ACTIVE_CURRENCIES_NOT_CONFIGURED',
    });
    expect(paymentsRepo.create).not.toHaveBeenCalled();
  });

  it('fails visibly when the money dependencies are not wired', async () => {
    const paymentsRepo = { create: vi.fn() };
    const service = createSubscriptionsService(
      { findLatestForMember: vi.fn(async () => null), create: vi.fn(async () => ({ id: 11 })) } as unknown as SubscriptionsRepository,
      paymentsRepo as unknown as PaymentsRepository,
      { findById: vi.fn(async () => PLAN) } as unknown as PlansRepository,
      { findById: vi.fn(async () => ({ id: PAYLOAD.memberId })) } as unknown as MembersRepository,
    );

    await expect(service.create('org-1', PAYLOAD, 'America/Caracas')).rejects.toThrow(
      /rateProvider, settingsRepo/,
    );
    expect(paymentsRepo.create).not.toHaveBeenCalled();
  });
});
