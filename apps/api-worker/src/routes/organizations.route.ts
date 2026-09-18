import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, requireOrg, requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES, PERMISSION_ACTIONS, type IPaymentMethodConfig } from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createPlatformReceiptsService } from '../services/platform-receipts.service';
import { createExchangeRateProvider } from '../lib/exchange-rates';
import { createCache } from '../lib/cache';
import { paymentMethodDetailsSchema, FiscalConfigSchema } from '../lib/schemas';
import { createOrganizationsService } from '../services/organizations.service';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createSettingsRepository } from '../repositories/settings.repository';
import type { NewDbOrganization } from '../repositories/organizations.repository';
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

/**
 * Perfil org-scoped: identidad de la sede (nombre, logo, eslogan, zona
 * horaria, formato de moneda) + identidad emisora fiscal (Fase 4).
 *
 * `countryCode`/`primaryCurrency` son inmutables desde aquí (required de
 * creación): se rechazan con 400 si vienen. Cambiar el país recalcularía la
 * moneda principal — operación de nivel plataforma, no del tenant.
 * `confirmed` es la fricción de la declaración de contribuyente formal.
 *
 * `.passthrough()` (no `.strict()`) es deliberado: permite DETECTAR las keys
 * prohibidas para responder 400 explícito. El handler solo reenvía campos
 * conocidos, así que lo demás no se persiste (sin mass-assignment).
 */
const orgProfileSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').optional(),
    slug: z.string().min(1).optional(),
    logo: z.string().nullable().optional(),
    slogan: z.string().nullable().optional(),
    timezone: z.string().min(1, 'La zona horaria es requerida').optional(),
    currencyFormat: z.enum(['latam', 'usa']).optional(),
    legalName: z.string().min(1).nullable().optional(),
    taxId: z.string().min(1).nullable().optional(),
    address: z.string().min(1).nullable().optional(),
    fiscalConfig: FiscalConfigSchema.nullable().optional(),
    confirmed: z.boolean().optional(),
  })
  .passthrough();

const FORBIDDEN_PROFILE_KEYS = ['countryCode', 'primaryCurrency'] as const;

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
  .get('/subscription', requireAuth(), requireOrg(), async (c) => {
    const activeOrganizationId = c.get('orgId')!;

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
  .get('/payment-methods', requireAuth(), requireOrg(), async (c) => {
    const activeOrganizationId = c.get('orgId')!;

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
      const activeOrganizationId = c.get('orgId')!;

      const data = c.req.valid('json');

      const repo = createPlatformSubscriptionsRepository(c.get('db'));
      const plansRepo = createPlatformPlansRepository(c.get('db'));
      const rateProvider = createExchangeRateProvider(c.env);
      const service = createPlatformSubscriptionsService(repo, plansRepo, rateProvider);

      const sub = await repo.findActiveByOrganization(activeOrganizationId);
      if (!sub) return c.json({ error: 'Suscripción no encontrada' }, 404);
      if (sub.cancelledAt) return c.json({ error: 'Suscripción cancelada' }, 400);

      // Bloqueo solo si hay un periodo REALMENTE pagado vigente
      // (`hasValidatedPayment`): un cliente con periodo por delante pero sin
      // pago calificado (p. ej. pago anulado) puede volver a pagar.
      const { hasValidatedPayment } = await repo.getLastSubscriptionStatus(activeOrganizationId);
      if (sub.currentPeriodEnd > new Date() && hasValidatedPayment) {
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
        // Pagador real = sesión org renovadora (el paso 1 lo persiste solo
        // si está vacío; `processing` no numera).
        const user = c.get('user')!;
        const receipts = createPlatformReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
        const { paymentId } = await service.renewOrgSubscription(sub.id, data, {
          receipts,
          payer: { email: user.email, name: user.name },
        });
        await cache.invalidate('platform:subscriptions*');
        await cache.invalidateExact(`org:${activeOrganizationId}:subscription`);
        await cache.invalidateExact(`org:${activeOrganizationId}:subscription-status`);
        await cache.invalidateExact(`org:${activeOrganizationId}:features`);
        await cache.invalidate(`org:${activeOrganizationId}:dashboard:action-items`);
        await cache.invalidateExact(`platform:subscriptions:invoices:${activeOrganizationId}`);

        // Confirmación al payer + owners de la org (el jobs-worker deduplica)
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
  )

  // PATCH /api/organizations/profile — identidad de la sede + identidad
  // emisora + fiscalConfig (Fase 4). Es el endpoint que usa el panel para el
  // formulario de organización: NUNCA se llama a `/api/platform/*` desde el
  // panel (un owner de gym no tiene rol de plataforma → 403). Org-scoped:
  // owner/manager (ORGANIZATION.UPDATE). `countryCode` y `primaryCurrency`
  // son inmutables post-creación (400 si vienen).
  .patch(
    '/profile',
    requireOrgPermission(PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.UPDATE),
    zValidator('json', orgProfileSchema),
    async (c) => {
      const orgId = c.get('orgId')!;
      const body = c.req.valid('json');

      // El schema es `.passthrough()` para poder detectar las keys prohibidas
      // (un `.strict()` las strippearía en silencio).
      const forbidden = FORBIDDEN_PROFILE_KEYS.filter((key) => key in body);
      if (forbidden.length > 0) {
        return c.json(
          {
            error: 'El país y la moneda principal se definen al crear la organización.',
            code: 'IMMUTABLE_FIELD',
            fields: forbidden,
          },
          400,
        );
      }

      const orgsRepo = createOrganizationsRepository(c.get('db'));
      const service = createOrganizationsService(
        orgsRepo,
        createSettingsRepository(c.get('db')),
      );

      const current = await service.findOrganizationById(orgId);
      if (!current) return c.json({ error: 'Organización no encontrada' }, 404);

      const incomingFiscal = body.fiscalConfig;
      const wantsFormal = incomingFiscal?.isFormalTaxpayer === true;
      const wasFormal =
        current.fiscalConfig != null &&
        (current.fiscalConfig as { isFormalTaxpayer?: boolean }).isFormalTaxpayer === true;
      // Fricción intencional SOLO en la transición false→true: declaración
      // explícita + confirmación (nunca un toggle cosmético).
      if (wantsFormal && !wasFormal && body.confirmed !== true) {
        return c.json(
          {
            error: 'Confirma la declaración de contribuyente formal para continuar.',
            code: 'FORMAL_TAXPAYER_CONFIRMATION_REQUIRED',
          },
          400,
        );
      }

      // Solo los campos presentes: un body sin campos persistibles es un
      // no-op idempotente, nunca un 500 de Drizzle ("No values to set").
      const patch: Partial<NewDbOrganization> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.slug !== undefined) patch.slug = body.slug;
      if (body.logo !== undefined) patch.logo = body.logo;
      if (body.slogan !== undefined) patch.slogan = body.slogan;
      if (body.timezone !== undefined) patch.timezone = body.timezone;
      if (body.currencyFormat !== undefined) patch.currencyFormat = body.currencyFormat;
      if (body.legalName !== undefined) patch.legalName = body.legalName;
      if (body.taxId !== undefined) patch.taxId = body.taxId;
      if (body.address !== undefined) patch.address = body.address;
      if (incomingFiscal !== undefined) patch.fiscalConfig = incomingFiscal;
      if (Object.keys(patch).length === 0) return c.json(current);

      const updated = await service.updateOrganization(orgId, patch);

      // El perfil de la sesión se cachea 5 min: invalidar para que el cambio
      // se refleje en `useAuth().activeOrganization` sin esperar el TTL.
      const cache = createCache(c.env);
      await cache.invalidateExact(`org:${orgId}:profile`);

      return c.json(updated);
    },
  );