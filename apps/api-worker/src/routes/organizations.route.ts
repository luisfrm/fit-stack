import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES, PERMISSION_ACTIONS, type IPaymentMethodConfig } from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createExchangeRateProvider } from '../lib/exchange-rates';
import { createCache } from '../lib/cache';
import { paymentMethodDetailsSchema } from '../lib/schemas';
import type { AppEnv } from '../lib/env';

/**
 * Keys de platform_setting (single source en apps/console/lib/config/platform-settings.ts).
 */
const ACTIVE_PAYMENT_METHODS_KEY = 'active_payment_methods';
const ACTIVE_CURRENCIES_KEY = 'active_currencies';
const CURRENCY_FORMAT_KEY = 'currency_format';

/**
 * Payload mínimo de la renovación autoservicio: NUNCA contiene montos ni
 * tasas — el backend los dicta (snapshot del plan + provider de tasas).
 */
const orgRenewSchema = z.object({
  paymentMethod: z.string().min(1),
  currencyPaid: z.string().min(1),
  paymentMethodDetails: paymentMethodDetailsSchema,
  paymentDate: z.string().optional(),
});

function parseJsonArray(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export const organizationRoutes = new Hono<AppEnv>()
  // GET /api/organizations/subscription-status
  .get('/subscription-status', requireAuth(), async (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;

    const userRole = (user as any).role;
    const activeOrganizationId = session.activeOrganizationId;

    if (!activeOrganizationId) {
      if (userRole === 'admin') {
        return c.json({ status: 'active' });
      }
      return c.json({ error: 'No active organization' }, 400);
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${activeOrganizationId}:subscription-status`;

    const cached = await cache.get<{ status: string }>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const platformSubsRepo = createPlatformSubscriptionsRepository(c.get('db'));
    const platformPlansRepo = createPlatformPlansRepository(c.get('db'));
    const platformSubsService = createPlatformSubscriptionsService(platformSubsRepo, platformPlansRepo);

    const status = await platformSubsService.getOrganizationStatus(activeOrganizationId);
    const data = { status };
    await cache.set(cacheKey, data, 60);

    return c.json(data);
  })

  // GET /api/organizations/subscription
  // Suscripción SaaS activa de la org con detalles del plan (precio, vencimiento, status).
  .get('/subscription', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const activeOrganizationId = session.activeOrganizationId;
    if (!activeOrganizationId) {
      return c.json({ error: 'No active organization' }, 400);
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${activeOrganizationId}:subscription`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const subscription = await repo.findActiveByOrganization(activeOrganizationId);
    const data = { subscription };
    await cache.set(cacheKey, data, 60);

    return c.json(data);
  })

  // GET /api/organizations/payment-methods
  // Métodos de pago de plataforma expuestos a la org (form de renovación autoservicio).
  .get('/payment-methods', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const activeOrganizationId = session.activeOrganizationId;
    if (!activeOrganizationId) {
      return c.json({ error: 'No active organization' }, 400);
    }

    const cache = createCache(c.env);
    const cacheKey = `org:${activeOrganizationId}:payment-methods`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
    const settings = await platformSettingsRepo.getAll();

    let activePaymentMethods: IPaymentMethodConfig[] = [];
    try {
      const parsed = JSON.parse(settings[ACTIVE_PAYMENT_METHODS_KEY] ?? '[]');
      activePaymentMethods = Array.isArray(parsed) ? parsed : [];
    } catch {
      activePaymentMethods = [];
    }

    const data = {
      activePaymentMethods,
      activeCurrencies: parseJsonArray(settings[ACTIVE_CURRENCIES_KEY], ['USD', 'VES']),
      currencyFormat: settings[CURRENCY_FORMAT_KEY] ?? 'latam',
    };
    // Dato de baja frecuencia: cambia solo cuando soporte edita platform settings
    // (la escritura invalida org:*:payment-methods). TTL 1h = red de seguridad.
    await cache.set(cacheKey, data, 3600);

    return c.json(data);
  })

  // POST /api/organizations/subscription/renew
  // Renovación autoservicio: solo al expirar, sin pagos pendientes, no cancelada.
  // El pago se registra como `processing` (revisión de soporte en console) y
  // NO extiende el periodo hasta que soporte lo valide.
  .post(
    '/subscription/renew',
    requireOrgPermission(PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.UPDATE),
    zValidator('json', orgRenewSchema),
    async (c) => {
      const session = c.get('session')!;
      const activeOrganizationId = session.activeOrganizationId;
      if (!activeOrganizationId) {
        return c.json({ error: 'No active organization' }, 400);
      }

      const data = c.req.valid('json');

      const repo = createPlatformSubscriptionsRepository(c.get('db'));
      const plansRepo = createPlatformPlansRepository(c.get('db'));
      const rateProvider = createExchangeRateProvider(c.env);
      const service = createPlatformSubscriptionsService(repo, plansRepo, rateProvider);

      const sub = await repo.findActiveByOrganization(activeOrganizationId);
      if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);
      if (sub.cancelledAt) return c.json({ error: 'Suscripción cancelada' }, 400);

      if (sub.currentPeriodEnd > new Date()) {
        return c.json(
          { error: 'La suscripción aún está vigente — la renovación solo está disponible al expirar' },
          409
        );
      }

      const hasPending = await repo.hasPendingPayment(sub.id);
      if (hasPending) {
        return c.json(
          { error: 'Ya existe un pago pendiente o en proceso para esta suscripción' },
          409
        );
      }

      const cache = createCache(c.env);
      try {
        const { paymentId } = await service.renewOrgSubscription(sub.id, data);
        await cache.invalidate('platform:subscriptions*');
        await cache.invalidateExact(`org:${activeOrganizationId}:subscription`);
        await cache.invalidateExact(`org:${activeOrganizationId}:subscription-status`);
        await cache.invalidateExact(`org:${activeOrganizationId}:features`);
        await cache.invalidate(`org:${activeOrganizationId}:dashboard:action-items`);

        // Confirmación al payer + owners de la org (el jobs-worker deduplica)
        const user = c.get('user')!;
        if (c.env.TASK_QUEUE) {
          await c.env.TASK_QUEUE.send({
            type: 'email.org_payment_received',
            paymentId,
            organizationId: activeOrganizationId,
            payerEmail: user.email,
            payerName: user.name,
          });
        }

        return c.json({ success: true, paymentId }, 201);
      } catch (err) {
        if (err instanceof Error && err.message === 'Exchange rate API unavailable') {
          return c.json({ error: 'Servicio de tasas de cambio no disponible, intente nuevamente' }, 503);
        }
        if (err instanceof Error && err.message.startsWith('No exchange rate for')) {
          return c.json({ error: 'Moneda de pago no soportada por el proveedor de tasas' }, 400);
        }
        throw err;
      }
    }
  );