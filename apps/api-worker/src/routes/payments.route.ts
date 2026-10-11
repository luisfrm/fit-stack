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
import { createFinanceService } from '../services/finance.service';
import { createR2Service } from '../lib/r2';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const updateStatusSchema = z.object({
  status: z.enum(['processing', 'validated', 'voided']),
  voidReason: z.string().min(1).optional(),
});

export const paymentRoutes = new Hono<AppEnv>()
  // GET /api/payments/analytics
  .get('/analytics', requireOrgPermission(PM.REPORTS, PA.READ), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:payments:analytics`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    // Timezone is required (validated by `requireOrgTimezone` middleware).
    const timezone = c.get('orgTimezone')!;

    const db = c.get('db');
    const paymentsRepo = createPaymentsRepository(db);
    const subsRepo = createSubscriptionsRepository(db);
    const financeService = createFinanceService(paymentsRepo, subsRepo);

    const stats = await financeService.getDashboardAnalytics(orgId, timezone);
    await cache.set(cacheKey, stats, 300);

    return c.json(stats);
  })
  // PATCH /api/payments/:id/status
  .patch('/:id/status', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), requireOrgTimezone(), zValidator('json', updateStatusSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const { status, voidReason } = c.req.valid('json');
    const timezone = c.get('orgTimezone')!;
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));
    const receiptsService = createReceiptsService(db, c.env.RECEIPT_QUEUE, c.env.TASK_QUEUE);

    const { payment, receiptVoided, receiptVoidReason } = await subsService.updatePaymentStatus(
      orgId,
      id,
      status,
      {
        receipts: receiptsService,
        timezone,
        by: c.get('user')?.id,
        voidReason,
      },
    );
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    await cache.invalidateExact(`org:${orgId}:payments:analytics`);
    // `withoutActiveSubscription` from members:stats depends on subs/payments.
    await cache.invalidateExact(`org:${orgId}:members:stats`);
    await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
    await cache.invalidate(`org:${orgId}:dashboard:action-items`);
    await cache.invalidate(`org:${orgId}:reports:revenue*`);
    await cache.invalidate(`org:${orgId}:reports:receipts*`);
    // C6: receipt voiding attempt is reported explicitly
    // (200 with `receiptVoided: false` + reason), never silently.
    return c.json({
      ...payment,
      receiptVoided,
      ...(receiptVoidReason ? { receiptVoidReason } : {}),
    });
  })

  // GET /api/payments/:id/receipt - 3-state contract, never 409.
  .get('/:id/receipt', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));

    const receiptsService = createReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const state = await receiptsService.getReceiptState(orgId, id);
    if (!state.available) return c.json(state, 200);
    if (state.pdfStatus === 'pending') {
      return c.json(
        {
          available: true,
          receiptNumber: state.receiptNumber,
          pdfStatus: 'pending',
        },
        202,
      );
    }
    return c.json({
      available: true,
      receiptNumber: state.receiptNumber,
      pdfStatus: 'ready',
      receipt: state.receipt,
      pdfUrl: `/api/payments/${id}/receipt/pdf`,
    });
  })

  // GET /api/payments/:id/receipt/pdf - binary download (200 bytes or 404).
  .get('/:id/receipt/pdf', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));

    const receiptsService = createReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const r2 = createR2Service(c.env);
    const state = await receiptsService.getReceiptState(orgId, id);
    if (!state.available || state.pdfStatus !== 'ready') {
      return c.json({ error: 'Comprobante no disponible.' }, 404);
    }
    const file = await r2.getFile(state.pdfKey);
    if (!file) {
      return c.json({ error: 'Comprobante no disponible.' }, 404);
    }
    return new Response(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${state.receiptNumber}.pdf"`,
      },
    });
  })

  // POST /api/payments/:id/issue - manual fallback, responds without waiting for PDF.
  .post('/:id/issue', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const timezone = c.get('orgTimezone')!;

    const receiptsService = createReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const result = await receiptsService.assignReceiptNumber({
      orgId,
      paymentId: id,
      timezone,
      // C5: manual emission also keeps actor audit trail.
      actor: c.get('user')?.id,
    });
    // Manual emission advances sequence: invalidates report cache.
    await createCache(c.env).invalidate(`org:${orgId}:reports:receipts*`);
    return c.json(result);
  })

  // POST /api/payments/:id/send-email - 4 branches resolved in service.
  .post('/:id/send-email', requireOrgPermission(PM.SUBSCRIPTIONS, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));

    const receiptsService = createReceiptsService(
      c.get('db'),
      c.env.RECEIPT_QUEUE,
      c.env.TASK_QUEUE,
    );
    const result = await receiptsService.sendReceiptEmail(orgId, id);
    if (result.kind === 'pending') {
      return c.json({ success: true, queued: false, pdfStatus: 'pending' }, 202);
    }
    return c.json({ success: true, queued: true, attachment: result.attachment });
  });
