import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformPermission } from '../lib/route-handler';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformReceiptsReportRepository } from '../repositories/platform-receipts-report.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createPlatformReceiptsService } from '../services/platform-receipts.service';
import { createPlatformReceiptsReportService } from '../services/platform-receipts-report.service';
import { createPlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import { createCache } from '../lib/cache';
import { createR2Service } from '../lib/r2';
import {
  paymentMethodDetailsSchema,
  paymentMethodSchema,
  requireVoidReason,
  voidReasonViolationHook,
} from '../lib/schemas';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';
import type { AppEnv } from '../lib/env';

const paymentStatusEnum = z.enum([
  PAYMENT_STATUSES.PROCESSING,
  PAYMENT_STATUSES.VALIDATED,
  PAYMENT_STATUSES.VOIDED,
  PAYMENT_STATUSES.REFUNDED,
]);

/**
 * RD-113: `refunded` is a reserved/display-only status. No issuer may PATCH a
 * payment to it (there is no refund flow, no UI and no receipt behind it).
 * The full enum above keeps feeding create/renew/registerPayment unchanged.
 *
 * RD-156: `processing` is a creation status, never a PATCH target. Accepting it
 * re-opened an already validated charge (`validated → processing → validated`),
 * which extended `current_period_end` a second time for the same payment.
 */
const updatePaymentStatusEnum = z.enum([
  PAYMENT_STATUSES.VALIDATED,
  PAYMENT_STATUSES.VOIDED,
]);

const paymentSchema = z.object({
  amountPaidCents: z.number().int().nonnegative(),
  currencyPaid: z.string().min(1),
  exchangeRateApplied: z.string().optional(),
  paymentMethod: paymentMethodSchema,
  paymentMethodDetails: paymentMethodDetailsSchema,
  status: paymentStatusEnum,
  paymentDate: z.string().optional(),
});

const createSubscriptionSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.number().int().positive(),
  startDate: z.string().optional(),
  isTrial: z.boolean().default(false),
  priceOverrideCents: z.number().int().nonnegative().optional(),
  payment: paymentSchema,
});

const renewSchema = z.object({
  payment: paymentSchema,
});

const updatePaymentStatusSchema = z
  .object({
    status: updatePaymentStatusEnum,
    // No length rule: `requireVoidReason` is the single authority, so a blank
    // reason answers `400 VOID_REASON_REQUIRED` (with `code`) instead of the
    // generic Zod envelope.
    voidReason: z.string().optional(),
  })
  // RD-163: same reason contract as the Panel PATCH (never a default reason).
  .superRefine(requireVoidReason);

const cancelSchema = z.object({
  reason: z.string().optional(),
});

const extendSchema = z.object({
  newEndDate: z.string().transform((str) => new Date(str)),
});

const receiptsReportQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD).')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD).')
    .optional(),
  status: z.enum(['all', 'issued', 'pending', 'voided', 'pre_system', 'gaps']).optional(),
  method: z.string().min(1).optional(),
  // UTC year of `payment_date` (the FS-N series is continuous, does not contain year).
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  page: z.coerce.number().int().positive().optional(),
  // High upper bound for CSV export (page uses 20; CSV up to 1000).
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

function buildService(c: any) {
  const repo = createPlatformSubscriptionsRepository(c.get('db'));
  const plansRepo = createPlatformPlansRepository(c.get('db'));
  return { repo, plansRepo, service: createPlatformSubscriptionsService(repo, plansRepo) };
}

/** Emission: step 1 where payment is validated (no I/O except DB+queue). */
function buildReceipts(c: any) {
  return createPlatformReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
}

/** Emission affects the org invoices history (the receipts report reads it). */
async function invalidateInvoicesCache(c: any, organizationId: string) {
  await createCache(c.env).invalidateExact(
    `platform:subscriptions:invoices:${organizationId}`,
  );
}

/**
 * Audit sequence (`GET /receipts`): invalidated on any
 * write of subscriptions/payments because they can issue or void a number.
 */
async function invalidateReceiptsReportCache(cache: ReturnType<typeof createCache>) {
  await cache.invalidate('platform:receipts*');
}

export const platformSubscriptionRoutes = new Hono<AppEnv>()
  // GET /api/platform/subscriptions
  .get('/', requirePlatformPermission('subscription', 'list'), async (c) => {
    const status = c.req.query('status') as any;
    const planId = c.req.query('planId') ? Number(c.req.query('planId')) : undefined;
    const organizationId = c.req.query('organizationId');
    const search = c.req.query('search');
    const isTrial = c.req.query('isTrial') !== undefined ? c.req.query('isTrial') === 'true' : undefined;
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '20');

    const cache = createCache(c.env);
    const cacheKey = `platform:subscriptions:${c.req.url}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const subscriptions = await service.getAllSubscriptions({
      status,
      planId,
      organizationId,
      isTrial,
      search,
      page,
      limit,
    });

    await cache.set(cacheKey, subscriptions, 300);
    return c.json(subscriptions);
  })

  // GET /api/platform/subscriptions/stats
  .get('/stats', requirePlatformPermission('subscription', 'list'), async (c) => {
    const cache = createCache(c.env);
    const cacheKey = 'platform:subscriptions:stats';

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const stats = await service.getStats();
    await cache.set(cacheKey, stats, 300);
    return c.json(stats);
  })

  // GET /api/platform/subscriptions/revenue?months=12 - monthly SaaS series in UTC.
  // Precedes /:id so Hono does not capture it as a param.
  .get('/revenue', requirePlatformPermission('subscription', 'list'), async (c) => {
    const raw = Number(c.req.query('months') || '12');
    const months = Math.min(24, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 12));

    const cache = createCache(c.env);
    const cacheKey = `platform:subscriptions:revenue:${months}m`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const revenue = await service.getRevenue(months);
    await cache.set(cacheKey, revenue, 3600);
    return c.json(revenue);
  })

  // GET /api/platform/subscriptions/receipts - audit of global correlative
  // `FS-N`: rows + summary + totals by currency + gaps (suspicious gap
  // vs explained void). Panel report mirror.
  // Read: support allowed (same contract as receipt download).
  .get('/receipts', requirePlatformPermission('subscription', 'list'), async (c) => {
    const parsed = receiptsReportQuerySchema.safeParse({
      from: c.req.query('from'),
      to: c.req.query('to'),
      status: c.req.query('status'),
      method: c.req.query('method'),
      year: c.req.query('year'),
      page: c.req.query('page'),
      limit: c.req.query('limit'),
    });
    if (!parsed.success) {
      return c.json(
        { error: 'Filtros del reporte inválidos.', code: 'INVALID_REPORT_FILTERS' },
        400,
      );
    }
    const filters = parsed.data;

    const cache = createCache(c.env);
    // Normalized key with defaults: `?status=all` and no query share cache.
    const cacheKey = `platform:receipts:${JSON.stringify({
      from: filters.from ?? null,
      to: filters.to ?? null,
      status: filters.status ?? 'all',
      method: filters.method ?? null,
      year: filters.year ?? null,
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const db = c.get('db');
    const service = createPlatformReceiptsReportService(
      createPlatformReceiptsReportRepository(db),
      createPlatformReceiptsRepository(db),
    );
    const report = await service.getReceiptsReport(filters);
    await cache.set(cacheKey, report, 300); // 5 min: invalidated on-write on issuance/voiding
    return c.json(report);
  })

  // GET /api/platform/subscriptions/by-organization/:orgId/invoices - SaaS history of org.
  // Precedes /:id so Hono does not capture it as a param.
  .get('/by-organization/:orgId/invoices', requirePlatformPermission('subscription', 'list'), async (c) => {
    const orgId = c.req.param('orgId');

    const cache = createCache(c.env);
    const cacheKey = `platform:subscriptions:invoices:${orgId}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const { service } = buildService(c);
    const invoices = await service.getOrganizationInvoices(orgId);
    await cache.set(cacheKey, invoices, 300);
    return c.json(invoices);
  })

  // GET /api/platform/subscriptions/:id
  .get('/:id', requirePlatformPermission('subscription', 'list'), async (c) => {
    const id = Number(c.req.param('id'));
    const { service } = buildService(c);

    const subscription = await service.getSubscriptionById(id);
    if (!subscription) return c.json({ error: 'Suscripción no encontrada' }, 404);

    return c.json(subscription);
  })

  // POST /api/platform/subscriptions
  .post('/', requirePlatformPermission('console', 'manage'), zValidator('json', createSubscriptionSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    // Compensated failure re-throws after mutating (payment voided / period reverted
    // / registration cancelled): invalidations run anyway in `finally`.
    let result;
    try {
      result = await service.createSubscriptionWithPayment(data, {
        receipts: buildReceipts(c),
        // Session actor emitting (`issued_by`).
        by: c.get('user')?.id,
      });
    } finally {
      await cache.invalidate('platform:subscriptions*');
      await invalidateReceiptsReportCache(cache);
      await cache.invalidateExact(`org:${data.organizationId}:subscription`);
      await cache.invalidateExact(`org:${data.organizationId}:subscription-status`);
      await cache.invalidateExact(`org:${data.organizationId}:features`);
      await invalidateInvoicesCache(c, data.organizationId);
    }

    const created = await service.getSubscriptionById(result.subscriptionId);
    return c.json(created, 201);
  })

  // POST /api/platform/subscriptions/:id/cancel
  .post('/:id/cancel', requirePlatformPermission('console', 'manage'), zValidator('json', cancelSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const { reason } = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.cancelSubscription(id, reason);
    await cache.invalidate('platform:subscriptions*');
    await invalidateReceiptsReportCache(cache);
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);
    await cache.invalidateExact(`org:${sub.organizationId}:features`);

    return c.json({ success: true, id });
  })

  // POST /api/platform/subscriptions/:id/extend
  .post('/:id/extend', requirePlatformPermission('console', 'manage'), zValidator('json', extendSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const { newEndDate } = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.extendSubscriptionPeriod(id, newEndDate);
    await cache.invalidate('platform:subscriptions*');
    await invalidateReceiptsReportCache(cache);
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);
    await cache.invalidateExact(`org:${sub.organizationId}:features`);

    return c.json({ success: true, newEndDate });
  })

  // POST /api/platform/subscriptions/:id/renew
  .post('/:id/renew', requirePlatformPermission('console', 'manage'), zValidator('json', renewSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    let result;
    try {
      result = await service.renewSubscription(id, data, {
        receipts: buildReceipts(c),
        // Session actor emitting (`issued_by`).
        by: c.get('user')?.id,
      });
    } finally {
      await cache.invalidate('platform:subscriptions*');
      await invalidateReceiptsReportCache(cache);
      await cache.invalidateExact(`org:${sub.organizationId}:subscription`);
      await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);
      await cache.invalidateExact(`org:${sub.organizationId}:features`);
      await invalidateInvoicesCache(c, sub.organizationId);
    }

    return c.json({ success: true, ...result });
  })

  // PATCH /api/platform/subscriptions/payments/:paymentId/status
  .patch('/payments/:paymentId/status', requirePlatformPermission('console', 'manage'), zValidator('json', updatePaymentStatusSchema, voidReasonViolationHook), async (c) => {
    const paymentId = Number(c.req.param('paymentId'));
    const { status, voidReason: rawVoidReason } = c.req.valid('json');
    // Trimmed once: persisted audit + receipt seal share the same reason.
    const data = { status, voidReason: rawVoidReason?.trim() || undefined };
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const payment = await service.getPaymentById(paymentId);
    if (!payment) return c.json({ error: 'Pago no encontrado' }, 404);

    // Explicit guard (no `!`): `requirePlatformPermission` guarantees session, but
    // the VOID actor is resolved same as the rest of the file.
    const actor = c.get('user')?.id;
    if (!actor) return c.json({ error: 'Sesión requerida.' }, 401);

    let receipt;
    try {
      receipt = await service.updatePaymentStatus(paymentId, data, {
        receipts: buildReceipts(c),
        by: actor,
      });
    } finally {
      await cache.invalidate('platform:subscriptions*');
      await invalidateReceiptsReportCache(cache);
      if (payment.organizationId) {
        await cache.invalidateExact(`org:${payment.organizationId}:subscription`);
        await cache.invalidateExact(`org:${payment.organizationId}:subscription-status`);
        await cache.invalidateExact(`org:${payment.organizationId}:features`);
        await invalidateInvoicesCache(c, payment.organizationId);
      }
    }

    // Receipt voiding attempt travels in response body
    // (`receiptVoided` + `receiptVoidReason`), never silently.
    return c.json({ success: true, paymentId, status: data.status, ...receipt });
  })

  // GET /api/platform/subscriptions/payments/:paymentId/receipt - 3-state contract,
  // never 409 (Panel mirror). Granular read: support allowed.
  .get('/payments/:paymentId/receipt', requirePlatformPermission('subscription', 'list'), async (c) => {
    const paymentId = Number(c.req.param('paymentId'));

    const receiptsService = createPlatformReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const state = await receiptsService.getPlatformReceiptState(paymentId);
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
      pdfUrl: `/api/platform/subscriptions/payments/${paymentId}/receipt/pdf`,
    });
  })

  // GET /api/platform/subscriptions/payments/:paymentId/receipt/pdf -
  // binary download (200 bytes or 404). Granular read: support allowed.
  .get('/payments/:paymentId/receipt/pdf', requirePlatformPermission('subscription', 'list'), async (c) => {
    const paymentId = Number(c.req.param('paymentId'));

    const receiptsService = createPlatformReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const r2 = createR2Service(c.env);
    const state = await receiptsService.getPlatformReceiptState(paymentId);
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

  // POST /api/platform/subscriptions/payments/:paymentId/resend - manual resend
  // to payer+owners (4 frozen branches). Admin/owner only: support 403.
  .post('/payments/:paymentId/resend', requirePlatformPermission('console', 'manage'), async (c) => {
    const paymentId = Number(c.req.param('paymentId'));

    const receiptsService = createPlatformReceiptsService(
      c.get('db'),
      c.env.RECEIPT_QUEUE,
      c.env.TASK_QUEUE,
    );
    const result = await receiptsService.resendPlatformReceiptEmail(paymentId);
    if (result.kind === 'presystem') {
      return c.json({ success: true, available: false, reason: 'pre_system' }, 200);
    }
    if (result.kind === 'pending') {
      return c.json({ success: true, queued: false, pdfStatus: 'pending' }, 202);
    }
    return c.json({ success: true, queued: true, attachment: result.attachment });
  })

  // GET /api/platform/subscriptions/:id/payments
  .get('/:id/payments', requirePlatformPermission('subscription', 'list'), async (c) => {
    const id = Number(c.req.param('id'));
    const { service } = buildService(c);

    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    const payments = await service.getSubscriptionPayments(id);
    return c.json(payments);
  })

  // POST /api/platform/subscriptions/:id/payments
  .post('/:id/payments', requirePlatformPermission('console', 'manage'), zValidator('json', paymentSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    let result;
    try {
      result = await service.registerPayment(id, data, {
        receipts: buildReceipts(c),
        // Actor de sesión que emite (`issued_by`).
        by: c.get('user')?.id,
      });
    } finally {
      await cache.invalidate('platform:subscriptions*');
      await invalidateReceiptsReportCache(cache);
      await cache.invalidateExact(`org:${sub.organizationId}:subscription`);
      await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);
      await cache.invalidateExact(`org:${sub.organizationId}:features`);
      await invalidateInvoicesCache(c, sub.organizationId);
    }

    return c.json({ success: true, ...result }, 201);
  })

  // DELETE /api/platform/subscriptions/:id
  .delete('/:id', requirePlatformPermission('console', 'manage'), async (c) => {
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const { service } = buildService(c);
    const sub = await service.getSubscriptionById(id);
    if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);

    await service.deleteSubscription(id);
    await cache.invalidate('platform:subscriptions*');
    await invalidateReceiptsReportCache(cache);
    await cache.invalidateExact(`org:${sub.organizationId}:subscription-status`);
    await cache.invalidateExact(`org:${sub.organizationId}:features`);
    await cache.invalidateExact(`platform:subscriptions:invoices:${sub.organizationId}`);

    return c.json({ success: true });
  });
