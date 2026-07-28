import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSubscriptionsRepository } from '../repositories/subscriptions.repository';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createPlansRepository } from '../repositories/plans.repository';
import { createSubscriptionsService } from '../services/subscriptions.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const updateStatusSchema = z.object({
  status: z.enum(['processing', 'validated', 'invalid', 'voided']),
});

export const paymentRoutes = new Hono<AppEnv>()
  // PATCH /api/payments/:id/status
  .patch('/:id/status', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), zValidator('json', updateStatusSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json');
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, c.env.TASK_QUEUE);

    const updated = await subsService.updatePaymentStatus(orgId, id, status);
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    return c.json(updated);
  })

  // POST /api/payments/:id/send-email
  .post('/:id/send-email', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, c.env.TASK_QUEUE);

    const result = await subsService.sendReceiptEmail(orgId, id);
    return c.json(result);
  });
