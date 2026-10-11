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
import { paymentMethodDetailsSchema, paymentMethodSchema, FiscalConfigSchema } from '../lib/schemas';
import { createOrganizationsService } from '../services/organizations.service';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createSettingsRepository } from '../repositories/settings.repository';
import type { NewDbOrganization } from '../repositories/organizations.repository';
import type { AppEnv } from '../lib/env';

/**
 * platform_setting keys (single source in apps/console/lib/config/platform-settings.ts).
 */
const ACTIVE_PAYMENT_METHODS_KEY = 'active_payment_methods';
const ACTIVE_CURRENCIES_KEY = 'active_currencies';
const CURRENCY_FORMAT_KEY = 'currency_format';

/**
 * Minimal payload for self-service renewal: NEVER contains amounts or
 * rates - backend dictates them (plan snapshot + exchange rate provider).
 */
const orgRenewSchema = z.object({
  paymentMethod: paymentMethodSchema,
  currencyPaid: z.string().min(1),
  paymentMethodDetails: paymentMethodDetailsSchema,
  paymentDate: z.string().optional(),
});

/**
 * Org-scoped profile: branch identity (name, logo, slogan, timezone,
 * currency format) + fiscal issuing identity (Phase 4).
 *
 * `countryCode`/`primaryCurrency` are immutable from here (required at
 * creation): rejected with 400 if provided. Changing country would recalculate
 * primary currency - platform-level operation, not tenant.
 * `confirmed` provides friction for formal taxpayer declaration.
 *
 * `.passthrough()` (not `.strict()`) is deliberate: allows DETECTING prohibited
 * keys to return an explicit 400. Handler only forwards known fields, so
 * extra data is not persisted (no mass-assignment).
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

type OrgProfileInput = z.infer<typeof orgProfileSchema>;

type ProfileScalarKey = Extract<keyof typeof orgProfileSchema.shape, keyof NewDbOrganization>;

const PROFILE_SCALAR_KEYS: readonly ProfileScalarKey[] = [
  'name',
  'slug',
  'logo',
  'slogan',
  'timezone',
  'currencyFormat',
  'legalName',
  'taxId',
  'address',
] as const;

/**
 * Checks whether transitioning to formal taxpayer requires explicit user confirmation.
 */
function requiresFormalTaxpayerConfirmation(
  body: OrgProfileInput,
  currentFiscalConfig: unknown,
): boolean {
  const wantsFormal = body.fiscalConfig?.isFormalTaxpayer === true;
  const wasFormal =
    (currentFiscalConfig as { isFormalTaxpayer?: boolean } | null)?.isFormalTaxpayer === true;

  return wantsFormal && !wasFormal && body.confirmed !== true;
}

/**
 * Builds the organization patch object containing only defined incoming fields.
 */
function buildOrganizationPatch(body: OrgProfileInput): Partial<NewDbOrganization> {
  const patch: Partial<NewDbOrganization> = {};
  for (const key of PROFILE_SCALAR_KEYS) {
    if (body[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }
  if (body.fiscalConfig !== undefined) {
    patch.fiscalConfig = body.fiscalConfig;
  }
  return patch;
}

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
  // Active SaaS subscription of org with plan details (price, expiry, status).
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
  // Platform payment methods exposed to org (self-service renewal form).
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
    // Low frequency data: changes only when support edits platform settings
    // (write invalidates org:*:payment-methods). TTL 1h = safety net.
    await cache.set(cacheKey, data, 3600);

    return c.json(data);
  })

  // POST /api/organizations/subscription/renew
  // Self-service renewal: only on expiry, no pending payments, not cancelled.
  // Payment is registered as `processing` (support review in console) and
  // does NOT extend period until support validates it.
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

      // Block only if there is a TRULY paid active period
      // (`hasValidatedPayment`): a client with period ahead but without
      // qualifying payment (e.g. voided payment) can pay again.
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
        // Real payer = renewing org session (step 1 persists it only
        // if empty; `processing` does not number).
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

        // Confirmation to payer + org owners (jobs-worker deduplicates)
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

  // PATCH /api/organizations/profile - branch identity + issuer
  // identity + fiscalConfig (Phase 4). Endpoint used by panel for
  // organization form: NEVER call `/api/platform/*` from panel
  // (gym owner does not have platform role -> 403). Org-scoped:
  // owner/manager (ORGANIZATION.UPDATE). `countryCode` and `primaryCurrency`
  // are immutable post-creation (400 if passed).
  .patch(
    '/profile',
    requireOrgPermission(PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.UPDATE),
    zValidator('json', orgProfileSchema),
    async (c) => {
      const orgId = c.get('orgId')!;
      const body = c.req.valid('json');

      // Schema is `.passthrough()` to detect prohibited keys
      // (`.strict()` would strip them silently).
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

      // Intentional friction ONLY on false->true transition: explicit
      // declaration + confirmation (never a cosmetic toggle).
      if (requiresFormalTaxpayerConfirmation(body, current.fiscalConfig)) {
        return c.json(
          {
            error: 'Confirma la declaración de contribuyente formal para continuar.',
            code: 'FORMAL_TAXPAYER_CONFIRMATION_REQUIRED',
          },
          400,
        );
      }

      // Only present fields: body without persistable fields is an
      // idempotent no-op, never a Drizzle 500 ("No values to set").
      const patch = buildOrganizationPatch(body);
      if (Object.keys(patch).length === 0) return c.json(current);

      const updated = await service.updateOrganization(orgId, patch);

      // Session profile is cached for 5 min: invalidate so changes
      // reflect in `useAuth().activeOrganization` without waiting for TTL.
      const cache = createCache(c.env);
      await cache.invalidateExact(`org:${orgId}:profile`);

      return c.json(updated);
    },
  );