import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, requireOrg, requireOrgPermission } from '../lib/route-handler';
import {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  buildOrgPaymentReceivedEvent,
  type CurrencyFormat,
  type IPaymentMethodConfig,
} from '@workspace/shared';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createPlatformReceiptsService } from '../services/platform-receipts.service';
import {
  createExchangeRateProvider,
  exchangeRateErrorResponse,
} from '../lib/exchange-rates';
import { createR2Service } from '../lib/r2';
import { createCache } from '../lib/cache';
import {
  paymentMethodDetailsSchema,
  paymentMethodSchema,
  documentIdTypeViolation,
} from '../lib/schemas';
import {
  activeCurrenciesNotConfiguredError,
  createOrganizationsService,
  parseActiveCurrencies,
} from '../services/organizations.service';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createSettingsRepository } from '../repositories/settings.repository';
import type { NewDbOrganization } from '../repositories/organizations.repository';
import type { AppEnv } from '../lib/env';
import {
  TENANT_FORBIDDEN_FISCAL_KEYS,
  TenantFiscalConfigSchema,
  type FiscalConfig,
} from '@workspace/shared';

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
 * currency format) + fiscal ISSUER identity (legalName/taxId/address) and
 * the disclaimer the tenant owns.
 *
 * The fiscal REGIME is platform-only: `isFormalTaxpayer` (and the legacy
 * `taxes`/`confirmedTaxes`) are rejected with an explicit
 * `403 FISCAL_CONFIG_PLATFORM_ONLY` (see `TENANT_FORBIDDEN_FISCAL_KEYS`).
 * Taxes are not configurable at all: `COUNTRIES` is their SSOT.
 *
 * `countryCode` is immutable from here (required at creation): rejected with
 * 400 if provided. `primaryCurrency` IS editable, but only inside the
 * organization's `active_currencies` (service answers 400 otherwise, no partial
 * write). Changing country would recalculate localization - platform-level
 * operation, not tenant.
 *
 * `.passthrough()` (not `.strict()`) is deliberate: allows DETECTING prohibited
 * keys (top-level and inside `fiscalConfig`) to return an explicit error.
 * Handler only forwards known fields, so extra data is not persisted
 * (no mass-assignment).
 */
const orgProfileSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').optional(),
    slug: z.string().min(1).optional(),
    logo: z.string().nullable().optional(),
    slogan: z.string().nullable().optional(),
    timezone: z.string().min(1, 'La zona horaria es requerida').optional(),
    currencyFormat: z.enum(['latam', 'usa']).optional(),
    // Editable, always inside the org's `active_currencies` (service validates).
    primaryCurrency: z.string().min(1).optional(),
    legalName: z.string().min(1).nullable().optional(),
    taxId: z.string().min(1).nullable().optional(),
    address: z.string().min(1).nullable().optional(),
    fiscalConfig: TenantFiscalConfigSchema.nullable().optional(),
  })
  .passthrough();

const FORBIDDEN_PROFILE_KEYS = ['countryCode'] as const;

type OrgProfileInput = z.infer<typeof orgProfileSchema>;

type ProfileScalarKey = Extract<keyof typeof orgProfileSchema.shape, keyof NewDbOrganization>;

const PROFILE_SCALAR_KEYS: readonly ProfileScalarKey[] = [
  'name',
  'slug',
  'logo',
  'slogan',
  'timezone',
  'currencyFormat',
  'primaryCurrency',
  'legalName',
  'taxId',
  'address',
] as const;

/**
 * Tenant-writable `fiscalConfig` keys. The forbidden ones are rejected by the
 * handler (`403`); here only the tenant-owned fields are copied, so a
 * platform key can never reach the merge (no mass-assignment).
 */
function toTenantFiscalConfig(
  fiscal: OrgProfileInput['fiscalConfig'],
): FiscalConfig | null {
  if (fiscal == null) return null;
  const sanitized: FiscalConfig = {};
  if (fiscal.documentLabel !== undefined) sanitized.documentLabel = fiscal.documentLabel;
  if (fiscal.disclaimerOverride !== undefined) {
    sanitized.disclaimerOverride = fiscal.disclaimerOverride;
  }
  return sanitized;
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
    patch.fiscalConfig = toTenantFiscalConfig(body.fiscalConfig);
  }
  return patch;
}

/**
 * Platform `currency_format` (seeded by `/api/init`). Required: an absent or
 * unknown value is a visible configuration error naming the key, never the
 * invented `latam` (AGENTS.md §10).
 */
function requirePlatformCurrencyFormat(settings: Record<string, string>): CurrencyFormat {
  const raw = settings[CURRENCY_FORMAT_KEY];
  if (raw === 'latam' || raw === 'usa') return raw;

  const message = `La configuración de la plataforma no tiene "currency_format" válido (latam | usa).`;
  throw new HTTPException(500, {
    message,
    res: new Response(
      JSON.stringify({
        error: message,
        code: 'PLATFORM_SETTING_INVALID',
        fields: [CURRENCY_FORMAT_KEY],
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    ),
  });
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

    // RD-163: the currency list is the authority for what the org may charge
    // in (self-service renewal). An absent/malformed platform value is a
    // visible configuration error — never `['USD','VES']`.
    const activeCurrencies = parseActiveCurrencies(settings[ACTIVE_CURRENCIES_KEY]);
    if (!activeCurrencies) throw activeCurrenciesNotConfiguredError();

    const data = {
      activePaymentMethods,
      activeCurrencies,
      currencyFormat: requirePlatformCurrencyFormat(settings),
    };
    // Low frequency data: changes only when support edits platform settings
    // (write invalidates org:*:payment-methods). TTL 1h = safety net.
    await cache.set(cacheKey, data, 3600);

    return c.json(data);
  })

  // GET /api/organizations/receipts
  // SaaS (FS-N) receipt history of the ACTIVE organization. Read-only and
  // strictly org-scoped: the platform audit lives in console, the gym only
  // ever sees its own payments. Amounts are integer cents.
  .get('/receipts', requireAuth(), requireOrg(), async (c) => {
    const activeOrganizationId = c.get('orgId')!;

    const platformSubsRepo = createPlatformSubscriptionsRepository(c.get('db'));
    const payments = await platformSubsRepo.getOrganizationInvoices(activeOrganizationId);

    return c.json({
      payments: payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        receiptVoided: p.receiptVoided,
        receiptIssuedAt: p.receiptIssuedAt,
        status: p.status,
        planName: p.planSnapshotName,
        planCurrency: p.planSnapshotCurrency,
        planDurationValue: p.planSnapshotDurationValue,
        planDurationUnit: p.planSnapshotDurationUnit,
        amountPaid: p.amountPaid,
        currencyPaid: p.currencyPaid,
        baseAmount: p.baseAmount,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
      })),
    });
  })

  // GET /api/organizations/receipts/:paymentId - 3-state receipt contract
  // (never 409), mirroring the gym contract. A payment from ANOTHER
  // organization answers 404: existence is never revealed.
  .get('/receipts/:paymentId', requireAuth(), requireOrg(), async (c) => {
    const activeOrganizationId = c.get('orgId')!;
    const paymentId = Number(c.req.param('paymentId'));

    const platformSubsRepo = createPlatformSubscriptionsRepository(c.get('db'));
    const payment =
      Number.isInteger(paymentId) && paymentId > 0
        ? await platformSubsRepo.findPaymentById(paymentId)
        : null;
    if (!payment || payment.organizationId !== activeOrganizationId) {
      return c.json({ error: 'Comprobante no disponible.' }, 404);
    }

    const receiptsService = createPlatformReceiptsService(c.get('db'), c.env.RECEIPT_QUEUE);
    const state = await receiptsService.getPlatformReceiptState(paymentId);
    if (!state.available) return c.json(state, 200);
    if (state.pdfStatus === 'pending') {
      return c.json(
        { available: true, receiptNumber: state.receiptNumber, pdfStatus: 'pending' },
        202,
      );
    }
    return c.json({
      available: true,
      receiptNumber: state.receiptNumber,
      pdfStatus: 'ready',
      receipt: state.receipt,
      pdfUrl: `/api/organizations/receipts/${paymentId}/pdf`,
    });
  })

  // GET /api/organizations/receipts/:paymentId/pdf - binary download (200
  // bytes or 404). Same org-scoping rule as the state endpoint.
  .get('/receipts/:paymentId/pdf', requireAuth(), requireOrg(), async (c) => {
    const activeOrganizationId = c.get('orgId')!;
    const paymentId = Number(c.req.param('paymentId'));

    const platformSubsRepo = createPlatformSubscriptionsRepository(c.get('db'));
    const payment =
      Number.isInteger(paymentId) && paymentId > 0
        ? await platformSubsRepo.findPaymentById(paymentId)
        : null;
    if (!payment || payment.organizationId !== activeOrganizationId) {
      return c.json({ error: 'Comprobante no disponible.' }, 404);
    }

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
          await c.env.TASK_QUEUE.send(
            buildOrgPaymentReceivedEvent({
              paymentId,
              organizationId: activeOrganizationId,
              payerEmail: user.email,
              payerName: user.name,
            }),
          );
        }

        return c.json({ success: true, paymentId }, 201);
      } catch (err) {
        // Rate failures are typed (`lib/exchange-rates.ts`), so the mapping is
        // by class, never by message text (single shared mapper).
        const rateFailure = exchangeRateErrorResponse(err);
        if (rateFailure) return c.json(rateFailure.body, rateFailure.status);
        throw err;
      }
    }
  )

  // PATCH /api/organizations/profile - branch identity + issuer
  // identity + fiscalConfig. Endpoint used by panel for
  // organization form: NEVER call `/api/platform/*` from panel
  // (gym owner does not have platform role -> 403). Org-scoped:
  // owner/manager (ORGANIZATION.UPDATE). `countryCode` is immutable
  // post-creation (400); `primaryCurrency` must be an active currency.
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
            error: 'El país de operación se define al crear la organización.',
            code: 'IMMUTABLE_FIELD',
            fields: forbidden,
          },
          400,
        );
      }

      // Fiscal regime is a PLATFORM decision (Console): the tenant can edit its
      // issuer identity and disclaimer, never `isFormalTaxpayer` nor the legacy
      // tax keys. Explicit 403 (not a silent strip).
      const fiscalConfig = body.fiscalConfig;
      // A `null` reset would wipe the platform-governed regime
      // (`isFormalTaxpayer`), so it is platform-only as well.
      if (fiscalConfig === null) {
        return c.json(
          {
            error: 'El régimen fiscal lo gestiona Fit-Stack desde la consola de plataforma.',
            code: 'FISCAL_CONFIG_PLATFORM_ONLY',
            fields: ['fiscalConfig'],
          },
          403,
        );
      }
      const platformFiscalKeys =
        fiscalConfig == null
          ? []
          : TENANT_FORBIDDEN_FISCAL_KEYS.filter((key) => key in fiscalConfig);
      if (platformFiscalKeys.length > 0) {
        return c.json(
          {
            error: 'El régimen fiscal lo gestiona Fit-Stack desde la consola de plataforma.',
            code: 'FISCAL_CONFIG_PLATFORM_ONLY',
            fields: platformFiscalKeys,
          },
          403,
        );
      }

      const orgsRepo = createOrganizationsRepository(c.get('db'));
      const service = createOrganizationsService(
        orgsRepo,
        createSettingsRepository(c.get('db')),
      );

      const current = await service.findOrganizationById(orgId);
      if (!current) return c.json({ error: 'Organización no encontrada' }, 404);

      // RD-148: the tax id prefix must belong to the organization's country.
      const identityViolation = documentIdTypeViolation(
        body.taxId,
        current.countryCode,
        'taxId',
        current.taxId,
      );
      if (identityViolation) return c.json(identityViolation, 400);

      // Only present fields: body without persistable fields is an
      // idempotent no-op, never a Drizzle 500 ("No values to set").
      const patch = buildOrganizationPatch(body);
      if (Object.keys(patch).length === 0) return c.json(current);

      const updated = await service.updateOrganization(orgId, patch);

      // Session profile is cached for 5 min: invalidate so changes
      // reflect in `useOrgAuth().activeOrganization` without waiting for TTL.
      const cache = createCache(c.env);
      await cache.invalidateExact(`org:${orgId}:profile`);

      return c.json(updated);
    },
  );