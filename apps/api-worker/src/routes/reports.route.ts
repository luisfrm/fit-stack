import { Hono } from 'hono';
import { z } from 'zod';
import { requireOrgPermission, requireOrgTimezone } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createPaymentsRepository } from '../repositories/payments.repository';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createReportsService } from '../services/reports.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

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
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  page: z.coerce.number().int().positive().optional(),
  // Tope alto para exportación CSV (la página usa 20; el CSV, hasta 1000).
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export const reportRoutes = new Hono<AppEnv>()
  // GET /api/reports/revenue
  .get('/revenue', requireOrgPermission(PM.REPORTS, PA.READ), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    // La tz es obligatoria (validada por el middleware `requireOrgTimezone`).
    const timezone = c.get('orgTimezone')!;
    const monthsCount = Number(c.req.query('monthsCount') || '12');

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:reports:revenue:${monthsCount}m`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const paymentsRepo = createPaymentsRepository(c.get('db'));
    const reportsService = createReportsService(paymentsRepo);

    const revenue = await reportsService.getMonthlyRevenue(orgId, timezone, monthsCount);
    await cache.set(cacheKey, revenue, 3600); // Cache 1 hour
    return c.json(revenue);
  })

  // GET /api/reports/receipts — auditoría del correlativo: filas + resumen
  // + totales por moneda + gaps[] (hueco sospechoso vs anulado explicado).
  .get('/receipts', requireOrgPermission(PM.REPORTS, PA.READ), requireOrgTimezone(), async (c) => {
    const orgId = c.get('orgId')!;
    // La tz es obligatoria (validada por el middleware `requireOrgTimezone`).
    const timezone = c.get('orgTimezone')!;

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
    // Key normalizada con defaults: `?status=all` y sin query comparten caché.
    const cacheKey = `org:${orgId}:reports:receipts:${JSON.stringify({
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
    const paymentsRepo = createPaymentsRepository(db);
    const reportsService = createReportsService(paymentsRepo);

    const orgSlug =
      (c.get('org')?.slug as string | null | undefined) ??
      (await createOrganizationsRepository(db).findById(orgId))?.slug ??
      null;
    if (!orgSlug) {
      return c.json({ error: 'La organización no tiene slug para auditar.' }, 500);
    }

    const report = await reportsService.getReceiptsReport(orgId, timezone, orgSlug, filters);
    await cache.set(cacheKey, report, 300); // 5 min: invalidado on-write en issue/void
    return c.json(report);
  });
