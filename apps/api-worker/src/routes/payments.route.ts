import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireOrgTimezone } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createSubscriptionsRepository } from '../repositories/subscriptions.repository';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createPlansRepository } from '../repositories/plans.repository';
import { createMembersRepository } from '../repositories/members.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createSubscriptionsService } from '../services/subscriptions.service';
import { createReceiptsService } from '../services/receipts.service';
import { createFinanceService } from '../services/finance.service';
import { createR2Service } from '../lib/r2';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const updateStatusSchema = z.object({
  status: z.enum(['processing', 'validated', 'invalid', 'voided']),
});

async function resolveOrgSlug(c: Context<AppEnv>, orgId: string): Promise<string | null> {
  const fromSession = c.get('org')?.slug as string | null | undefined;
  if (fromSession) return fromSession;
  const org = await createOrganizationsRepository(c.get('db')).findById(orgId);
  return org?.slug ?? null;
}

export const paymentRoutes = new Hono<AppEnv>()
  // GET /api/payments/analytics
  .get('/analytics', requireOrgPermission(PM.REPORTS, PA.READ), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:payments:analytics`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    // La tz es obligatoria (validada por el middleware `requireOrgTimezone`).
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
    const { status } = c.req.valid('json');
    const timezone = c.get('orgTimezone')!;
    const cache = createCache(c.env);

    const db = c.get('db');
    const subsRepo = createSubscriptionsRepository(db);
    const paymentsRepo = createPaymentsRepository(db);
    const plansRepo = createPlansRepository(db);
    const subsService = createSubscriptionsService(subsRepo, paymentsRepo, plansRepo, createMembersRepository(db), c.env.TASK_QUEUE);
    const receiptsService = createReceiptsService(db, c.env.RECEIPT_QUEUE, c.env.TASK_QUEUE);

    const updated = await subsService.updatePaymentStatus(orgId, id, status, {
      receipts: receiptsService,
      orgSlug: await resolveOrgSlug(c, orgId),
      timezone,
      by: c.get('user')?.id,
    });
    await cache.invalidate(`org:${orgId}:subscriptions*`);
    await cache.invalidateExact(`org:${orgId}:payments:analytics`);
    // `withoutActiveSubscription` de members:stats depende de subs/pagos.
    await cache.invalidateExact(`org:${orgId}:members:stats`);
    await cache.invalidate(`org:${orgId}:dashboard:stats:*`);
    await cache.invalidate(`org:${orgId}:dashboard:action-items`);
    await cache.invalidate(`org:${orgId}:reports:revenue*`);
    return c.json(updated);
  })

  // GET /api/payments/:id/receipt — contrato de 3 estados, nunca 409.
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

  // GET /api/payments/:id/receipt/pdf — descarga binaria (200 bytes o 404).
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

  // POST /api/payments/:id/issue — fallback manual, responde sin esperar el PDF.
  .post('/:id/issue', requireOrgPermission(PM.SUBSCRIPTIONS, PA.UPDATE), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    const id = Number(c.req.param('id'));
    const timezone = c.get('orgTimezone')!;

    const receiptsService = createReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const result = await receiptsService.assignReceiptNumber({
      orgId,
      paymentId: id,
      timezone,
      orgSlug: await resolveOrgSlug(c, orgId),
    });
    return c.json(result);
  })

  // POST /api/payments/:id/send-email — 4 ramas resueltas en el servicio.
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
