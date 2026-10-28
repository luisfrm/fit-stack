/**
 * RD-156 — service-level transition guard for payment status changes.
 *
 * The route enums already accept only `validated | voided`, so the HTTP layer
 * cannot reach the illegal legs. This freezes the service backstop (defence in
 * depth) with stubbed repositories, without a DB:
 *
 *   - `* → processing` → 400 `PAYMENT_STATUS_TRANSITION_INVALID`, no write.
 *   - `validated → validated` → idempotent: no renumber, no period move.
 *
 * The legal legs and their side effects are covered over real HTTP in
 * `integration/subscriptions.test.ts` and
 * `integration/platform-subscription-status.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { createSubscriptionsService } from '../../src/services/subscriptions.service';
import { createPlatformSubscriptionsService } from '../../src/services/platform-subscriptions.service';
import type { PaymentsRepository } from '../../src/repositories/payments.repository';
import type { SubscriptionsRepository } from '../../src/repositories/subscriptions.repository';
import type { PlatformSubscriptionsRepository } from '../../src/repositories/platform-subscriptions.repository';
import type { createPlatformPlansRepository } from '../../src/repositories/platform-plans.repository';
import type { PlatformReceiptHooks } from '../../src/services/platform-receipts.service';

/** Panel worker service: only the payment/subscription repos take part here. */
function buildGymService(payment: { status: string; subscriptionId?: number | null }) {
  const paymentsRepo = {
    findById: vi.fn(async () => ({ id: 7, receiptNumber: '2026-1', ...payment })),
    updateStatus: vi.fn(async () => ({ id: 7, ...payment })),
  };
  const subsRepo = {
    findById: vi.fn(async () => ({ id: 1, cancelledAt: null })),
    cancel: vi.fn(async () => ({ id: 1 })),
  };
  const service = createSubscriptionsService(
    subsRepo as unknown as SubscriptionsRepository,
    paymentsRepo as unknown as PaymentsRepository,
    {} as never,
    {} as never,
  );
  return { service, paymentsRepo };
}

/** Console worker service: payment repo + the receipt hook (renumber spy). */
function buildPlatformService(payment: { status: string; subscriptionId?: number | null }) {
  const repo = {
    findPaymentById: vi.fn(async () => ({ id: 11, ...payment })),
    findById: vi.fn(async () => ({ id: 3, cancelledAt: null, currentPeriodEnd: new Date() })),
    updatePaymentStatus: vi.fn(async () => undefined),
    updatePeriodEnd: vi.fn(async () => undefined),
  };
  const service = createPlatformSubscriptionsService(
    repo as unknown as PlatformSubscriptionsRepository,
    {} as ReturnType<typeof createPlatformPlansRepository>,
    {} as never,
  );
  const receipts: PlatformReceiptHooks = {
    assignPlatformReceiptNumber: vi.fn(async () => ({
      receiptNumber: 'FS-0000001',
      pdfStatus: 'pending' as const,
      skipped: false as const,
    })),
    setPayerIfMissing: vi.fn(async () => undefined),
    markPlatformReceiptVoided: vi.fn(async () => undefined),
  };
  return { service, repo, receipts };
}

describe('RD-156 payment status transitions (service guard)', () => {
  it('Panel: `validated → processing` is a 400 with a stable code and writes nothing', async () => {
    const { service, paymentsRepo } = buildGymService({ status: 'validated' });

    const err = await service
      .updatePaymentStatus('org-1', 7, 'processing', { by: 'user-1', timezone: 'UTC' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(400);
    const body = (await (err as HTTPException).res!.json()) as { code?: string };
    expect(body).toMatchObject({ code: 'PAYMENT_STATUS_TRANSITION_INVALID' });
    expect(paymentsRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('Console: `validated → processing` is a 400 with the same code and writes nothing', async () => {
    const { service, repo } = buildPlatformService({ status: 'validated' });

    const err = await service
      .updatePaymentStatus(11, { status: 'processing' }, { by: 'admin-1' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(400);
    const body = (await (err as HTTPException).res!.json()) as { code?: string };
    expect(body).toMatchObject({ code: 'PAYMENT_STATUS_TRANSITION_INVALID' });
    expect(repo.updatePaymentStatus).not.toHaveBeenCalled();
    expect(repo.updatePeriodEnd).not.toHaveBeenCalled();
  });

  it('Console: `validated → validated` is idempotent (no renumber, no period move)', async () => {
    const { service, repo, receipts } = buildPlatformService({ status: 'validated', subscriptionId: 3 });

    await expect(
      service.updatePaymentStatus(11, { status: 'validated' }, { by: 'admin-1', receipts }),
    ).resolves.toEqual({ receiptVoided: false, receiptVoidReason: undefined });

    expect(receipts.assignPlatformReceiptNumber).not.toHaveBeenCalled();
    expect(repo.updatePeriodEnd).not.toHaveBeenCalled();
  });

  it('Console: `voided → validated` stays a 409 PAYMENT_NOT_REVALIDATABLE', async () => {
    const { service, repo } = buildPlatformService({ status: 'voided', subscriptionId: 3 });

    const err = await service
      .updatePaymentStatus(11, { status: 'validated' }, { by: 'admin-1' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    const body = (await (err as HTTPException).res!.json()) as { code?: string };
    expect(body).toMatchObject({ code: 'PAYMENT_NOT_REVALIDATABLE' });
    expect(repo.updatePaymentStatus).not.toHaveBeenCalled();
  });
});

/**
 * RD-163 — service backstop for the mandatory void reason (the route schema is
 * the first line of defence; this proves the service never writes a `voided`
 * with an invented reason when called from another entry point).
 */
describe('RD-163 payment void reason (service backstop)', () => {
  it('Panel: `voided` without a reason or with an empty one is a 400 VOID_REASON_REQUIRED and writes nothing', async () => {
    const { service, paymentsRepo } = buildGymService({ status: 'processing' });

    for (const voidReason of [undefined, '']) {
      const err = await service
        .updatePaymentStatus('org-1', 7, 'voided', { by: 'user-1', voidReason })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      const body = (await (err as HTTPException).res!.json()) as {
        code?: string;
        fields?: string[];
      };
      expect(body).toMatchObject({ code: 'VOID_REASON_REQUIRED', fields: ['voidReason'] });
    }
    expect(paymentsRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('Console: `voided` with a blank or empty reason is a 400 VOID_REASON_REQUIRED and writes nothing', async () => {
    const { service, repo } = buildPlatformService({ status: 'processing', subscriptionId: 3 });

    for (const voidReason of ['', '   ']) {
      const err = await service
        .updatePaymentStatus(11, { status: 'voided', voidReason }, { by: 'admin-1' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      const body = (await (err as HTTPException).res!.json()) as { code?: string; fields?: string[] };
      expect(body).toMatchObject({ code: 'VOID_REASON_REQUIRED', fields: ['voidReason'] });
    }
    expect(repo.updatePaymentStatus).not.toHaveBeenCalled();
  });
});
