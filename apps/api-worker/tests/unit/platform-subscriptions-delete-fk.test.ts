/**
 * RD-153 — service-level backstop for the subscription delete guard.
 *
 * The app-level pre-check (`countPaymentsBySubscription`) has a TOCTOU window:
 * a payment can land between the count and the delete. The DB-level `RESTRICT`
 * FK is the source of truth, so the service must translate its violation
 * (SQLSTATE `23503`) into the SAME `409 SUBSCRIPTION_HAS_PAYMENTS` contract —
 * never a leaked `500`. The HTTP paths are covered by
 * `integration/platform-subscriptions-delete.test.ts`; here the mapping is
 * frozen with a stubbed repository (no DB).
 */
import { describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { createPlatformSubscriptionsService } from '../../src/services/platform-subscriptions.service';
import type { PlatformSubscriptionsRepository } from '../../src/repositories/platform-subscriptions.repository';
import type { createPlatformPlansRepository } from '../../src/repositories/platform-plans.repository';

/** Minimal repo stub: only the two methods `deleteSubscription` touches. */
function stubRepo(options: {
  count?: number;
  deleteImpl?: () => Promise<unknown>;
}): PlatformSubscriptionsRepository {
  return {
    countPaymentsBySubscription: vi.fn(async () => options.count ?? 0),
    delete: vi.fn(options.deleteImpl ?? (async () => undefined)),
  } as unknown as PlatformSubscriptionsRepository;
}

function buildService(repo: PlatformSubscriptionsRepository) {
  return createPlatformSubscriptionsService(
    repo,
    {} as ReturnType<typeof createPlatformPlansRepository>,
  );
}

/**
 * Drizzle wraps driver errors: the SQLSTATE lives in the deep `cause`
 * (same shape `lib/errors.ts` unwraps for the global handler).
 */
function foreignKeyViolation(): Error {
  const cause = Object.assign(
    new Error(
      'update or delete on table "platform_subscription" violates foreign key constraint',
    ),
    {
      code: '23503',
      // Postgres truncates identifiers to 63 chars.
      constraint: 'platform_subscription_payment_subscription_id_platform_subscrip',
    },
  );
  const wrapped = new Error('Failed query: delete from "platform_subscription"');
  (wrapped as Error & { cause: unknown }).cause = cause;
  return wrapped;
}

async function capture(fn: () => Promise<unknown>): Promise<HTTPException> {
  try {
    await fn();
  } catch (err) {
    return err as HTTPException;
  }
  throw new Error('expected the call to throw');
}

describe('deleteSubscription', () => {
  it('pre-check: 409 when payments exist and never calls the delete', async () => {
    const repo = stubRepo({ count: 1 });
    const service = buildService(repo);

    const err = await capture(() => service.deleteSubscription(7));

    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(409);
    const body = (await err.res!.json()) as { code?: string };
    expect(body).toMatchObject({ code: 'SUBSCRIPTION_HAS_PAYMENTS' });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('backstop: a FK violation (23503) from the delete maps to the same 409', async () => {
    const repo = stubRepo({
      count: 0,
      deleteImpl: async () => {
        throw foreignKeyViolation();
      },
    });
    const service = buildService(repo);

    const err = await capture(() => service.deleteSubscription(7));

    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(409);
    const body = (await err.res!.json()) as { code?: string };
    expect(body).toMatchObject({ code: 'SUBSCRIPTION_HAS_PAYMENTS' });
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });

  it('does not swallow unrelated errors', async () => {
    const repo = stubRepo({
      count: 0,
      deleteImpl: async () => {
        throw new Error('connection reset');
      },
    });
    const service = buildService(repo);

    await expect(service.deleteSubscription(7)).rejects.toThrow('connection reset');
  });

  it('deletes when there are no payments and the FK passes', async () => {
    const repo = stubRepo({ count: 0, deleteImpl: async () => ({ deleted: true }) });
    const service = buildService(repo);

    await expect(service.deleteSubscription(7)).resolves.toEqual({ deleted: true });
  });
});
