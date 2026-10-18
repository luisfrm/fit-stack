import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireOrgTimezone } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSubscriptionsRepository } from '../repositories/subscriptions.repository';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createPlansRepository } from '../repositories/plans.repository';
import { createMembersRepository } from '../repositories/members.repository';
import { createSubscriptionsService } from '../services/subscriptions.service';
import { createReceiptsService } from '../services/receipts.service';
import { createCache, type Cache } from '../lib/cache';
import { paymentMethodDetailsSchema, paymentMethodSchema } from '../lib/schemas';
import type { AppEnv } from '../lib/env';

/**
 * Every subscription write creates/updates a payment and moves the period:
 * invalidates all caches dependent on subscriptions + payments in bulk.
 */
async function invalidateSubscriptionDependentCaches(cache: Cache, orgId: string): Promise<void> {
  await cache.invalidate(`org:${orgId}:subscriptions*`);
  await cache.invalidateExact(`org:${orgId}:subscription-status`);
  await cache.invalidateExact(`org:${orgId}:payments:analytics`);
  // `withoutActiveSubscription` from members:stats depends on subs/payments.
  await cache.invalidateExact(`org:${orgId}:members:stats`);
  await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
  await cache.invalidate(`org:${orgId}:dashboard:action-items`);
  await cache.invalidate(`org:${orgId}:reports:revenue*`);
  await cache.invalidate(`org:${orgId}:reports:receipts*`);
}

const createSubSchema = z.object({
  memberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  // The server computes the period. `startDate` and `endDate` are optional;
  // the non-empty reason is enforced in the service (not in zod) so it can
  // return its own 422 code.
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  endDateOverrideReason: z.string().optional(),
  payment: z.object({
    // All money in integer cents (Money convention, see AGENTS.md).
    amountPaid: z.number().int().positive(),
    currencyPaid: z.string(),
    exchangeRateApplied: z.string().nullable().optional(),
    paymentMethod: paymentMethodSchema,
    paymentMethodDetails: paymentMethodDetailsSchema,
    // RD-113: creation only accepts `processing`/`validated` (an omitted status
    // normalizes to `validated` in the service). Voiding is a PATCH transition
    // with its own audit trail, so a payment cannot be born `voided`.
    status: z.enum(['processing', 'validated']).optional(),
    paymentDate: z.string().optional(),
    // The tax breakdown is NOT part of the write contract: it is always
    // computed from `COUNTRIES` (SSOT) at emission time.
  }),
});

const updateSubStatusSchema = z.object({
  status: z.enum(['active', 'cancelled']),
});

export const subscriptionRoutes = new Hono<AppEnv>()
  // GET /api/subscriptions
  .get('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const query = c.req.query('query');
    const status = c.req.query('status');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:subscriptions:${c.req.url}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));

    const result = await subsService.getAllPaginated(orgId, { query, status, page, limit });
    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/subscriptions/recent?limit=...
  .get('/recent', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const limit = Number(c.req.query('limit') || '5');

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));

    const recent = await subsService.getRecent(orgId, limit);
    return c.json(recent);
  })

  // POST /api/subscriptions
  .post('/', requireOrgPermission(PM.SUBSCRIPTIONS, PA.CREATE), requireOrgTimezone(), zValidator('json', createSubSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const payload = c.req.valid('json');
    // Timezone is required (validated by `requireOrgTimezone` middleware).
    const timezone = c.get('orgTimezone')!;
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));
    const receiptsService = createReceiptsService(db, c.env.RECEIPT_QUEUE);

    let newSub;
    try {
      newSub = await subsService.create(orgId, payload as any, timezone, {
        receipts: receiptsService,
        // Session actor emitting receipt (recorded in `issued_by`).
        by: c.get('user')?.id,
      });
    } finally {
      // On a compensated failure the service re-throws after mutating (payment
      // voided / orphan cancelled): the cache is invalidated either way.
      await invalidateSubscriptionDependentCaches(cache, orgId);
    }
    return c.json(newSub, 201);
  })

  // PUT /api/subscriptions/:id
  .put('/:id', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), zValidator('json', updateSubStatusSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json');
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));

    const updated = await subsService.updateStatus(orgId, id, status);
    await invalidateSubscriptionDependentCaches(cache, orgId);
    return c.json(updated);
  });
// Note: DELETE /:id does not exist. A financial record (subscription + payment) is
// never deleted - the payment is voided (`PATCH /api/payments/:id/status`).
