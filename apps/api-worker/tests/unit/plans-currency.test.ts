/**
 * Plans are billed in a supported currency: an unknown code (e.g. "XYZ") would
 * make `Intl.NumberFormat` throw when the plan card renders. The service must
 * reject it with the explicit `UNSUPPORTED_CURRENCY` 400 BEFORE writing, while
 * still allowing a valid currency and partial updates that do not touch it.
 */
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlansService,
  type IMembershipPlan,
} from '../../src/services/plans.service';
import type { PlansRepository } from '../../src/repositories/plans.repository';

type CreateData = Omit<IMembershipPlan, 'id' | 'organizationId'>;

const PLAN: IMembershipPlan = {
  id: 1,
  organizationId: 'org-1',
  name: 'Plan Mensual',
  price: 5000,
  currency: 'USD',
  durationValue: 1,
  durationUnit: 'month',
  features: null,
  isPopular: false,
  isActive: true,
  isVisibleOnSite: true,
};

const PLAN_DATA: CreateData = {
  name: PLAN.name,
  price: PLAN.price,
  currency: PLAN.currency,
  durationValue: PLAN.durationValue,
  durationUnit: PLAN.durationUnit,
  features: PLAN.features,
  isPopular: PLAN.isPopular,
  isActive: PLAN.isActive,
  isVisibleOnSite: PLAN.isVisibleOnSite,
};

function fakeRepo() {
  const findById = vi.fn(async () => PLAN);
  const create = vi.fn(async (_organizationId: string, data: CreateData) => ({
    ...PLAN,
    ...data,
  }));
  const update = vi.fn(
    async (_organizationId: string, _id: number, data: Partial<IMembershipPlan>) => ({
      ...PLAN,
      ...data,
    }),
  );
  return {
    repo: { findById, create, update } as unknown as PlansRepository,
    findById,
    create,
    update,
  };
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

describe('plans service — currency validation', () => {
  it('rejects an unsupported currency on create with the explicit 400 and no write', async () => {
    const { repo, create } = fakeRepo();
    const service = createPlansService(repo);

    const error = await captureHttpError(
      service.create('org-1', { ...PLAN_DATA, currency: 'XYZ' }),
    );

    expect(error.status).toBe(400);
    expect(await error.res?.clone().json()).toMatchObject({
      code: 'UNSUPPORTED_CURRENCY',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the plan when the currency is supported', async () => {
    const { repo, create } = fakeRepo();
    const service = createPlansService(repo);

    const plan = await service.create('org-1', { ...PLAN_DATA, currency: 'EUR' });

    expect(plan.currency).toBe('EUR');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported currency on update with the explicit 400 and no write', async () => {
    const { repo, update } = fakeRepo();
    const service = createPlansService(repo);

    const error = await captureHttpError(
      service.update('org-1', 1, { currency: 'XYZ' }),
    );

    expect(error.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows a partial update that does not touch the currency', async () => {
    const { repo, update } = fakeRepo();
    const service = createPlansService(repo);

    const plan = await service.update('org-1', 1, { name: 'Plan renombrado' });

    expect(plan.name).toBe('Plan renombrado');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
