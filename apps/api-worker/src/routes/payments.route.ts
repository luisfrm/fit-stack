import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireOrgTimezone, requireOrgCurrency } from '../lib/route-handler';
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
import { requireVoidReason, voidReasonViolationHook } from '../lib/schemas';
import type { AppEnv } from '../lib/env';

/**
 * RD-156: a PATCH only carries the two decisions an operator makes on an
 * existing charge — confirm (`validated`) or void (`voided`). `processing` is a
 * creation status: accepting it here allowed `validated → processing →
 * validated`, which numbered and extended the same charge twice.
 *
 * RD-163: `voided` requires a non-blank `voidReason`; `validated` ignores it.
 * The field has no length rule of its own: `requireVoidReason` is the single
 * authority, so a blank string arrives as the business error (with `code`),
 * never as a generic Zod envelope.
 */
const updateStatusSchema = z
  .object({
    status: z.enum(['validated', 'voided']),
    voidReason: z.string().optional(),
  })
  .superRefine(requireVoidReason);

export const paymentRoutes = new Hono<AppEnv>()
  // GET /api/payments/analytics
  .get('/analytics', requireOrgPermission(PM.REPORTS, PA.READ), requireOrgTimezone(), requireOrgCurrency(), async (c) => {
    const orgId = c.get('orgId')!;
    const primaryCurrency = c.get('orgCurrency')!;
    const cache = createCache(c.env);
    // The normalization target is part of the key: changing the primary
    // currency must never serve a total normalized to the previous one.
    const cacheKey = `org:${orgId}:payments:analytics:${primaryCurrency}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    // Timezone is required (validated by `requireOrgTimezone` middleware).
    const timezone = c.get('orgTimezone')!;

    const db = c.get('db');
    const paymentsRepo = createPaymentsRepository(db);
    const subsRepo = createSubscriptionsRepository(db);
    const financeService = createFinanceService(paymentsRepo, subsRepo);

    const stats = await financeService.getDashboardAnalytics(orgId, timezone, primaryCurrency);
    await cache.set(cacheKey, stats, 300);

    return c.json(stats);
  })
  // PATCH /api/payments/:id/status
  .patch('/:id/status', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), requireOrgTimezone(), zValidator('json', updateStatusSchema, voidReasonViolationHook), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const { status, voidReason: rawVoidReason } = c.req.valid('json');
    // Trimmed once: the persisted audit and the receipt seal share the reason.
    const voidReason = rawVoidReason?.trim() || undefined;
    const timezone = c.get('orgTimezone')!;
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db));
    const receiptsService = createReceiptsService(db, c.env.RECEIPT_QUEUE, c.env.TASK_QUEUE);

    // RD-155: invalidation lives in `finally` so a failed emission (the service
    // compensates the payment to `voided` and re-throws) still drops the stale
    // dashboard/report entries instead of serving the pre-PATCH state.
    try {
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
      // Receipt voiding attempt is reported explicitly
      // (200 with `receiptVoided: false` + reason), never silently.
      return c.json({
        ...payment,
        receiptVoided,
        ...(receiptVoidReason ? { receiptVoidReason } : {}),
      });
    } finally {
      await cache.invalidate(`org:${orgId}:subscriptions*`);
      await cache.invalidate(`org:${orgId}:payments:analytics*`);
      // `withoutActiveSubscription` from members:stats depends on subs/payments.
      await cache.invalidateExact(`org:${orgId}:members:stats`);
      await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
      await cache.invalidate(`org:${orgId}:dashboard:action-items`);
      await cache.invalidate(`org:${orgId}:reports:revenue*`);
      await cache.invalidate(`org:${orgId}:reports:receipts*`);
    }
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
      // Manual emission also keeps actor audit trail.
      actor: c.get('user')?.id,
    });
    // Manual emission advances sequence: invalidates report cache.
    await createCache(c.env).invalidate(`org:${orgId}:reports:receipts*`);
    // Another emission holds the claim: nothing to wait for yet beyond the
    // sweep, so the contract is 202/pending (never an error).
    if (result.receiptNumber === null) {
      return c.json(result, 202);
    }
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
