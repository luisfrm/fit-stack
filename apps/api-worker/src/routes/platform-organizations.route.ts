import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createSettingsRepository } from '../repositories/settings.repository';
import { createOrganizationsService } from '../services/organizations.service';
import { createMembersRepository } from '../repositories/members.repository';
import { createUsersRepository } from '../repositories/users.repository';
import { createTokenService } from '../services/token.service';
import { createMembersService } from '../services/members.service';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createFeaturesService } from '../services/features.service';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createCache } from '../lib/cache';
import { createR2Service } from '../lib/r2';
import { constructStorageKey, orgStorageListPrefix } from '../lib/storage-keys';
import { paymentMethodDetailsSchema, FiscalConfigSchema } from '../lib/schemas';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';
import { DEFAULT_ORG_STAFF_VALUES, isOrgStorageKey } from '@workspace/shared';
import type { AppEnv } from '../lib/env';

const createOrgSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z.string().optional(),
  logo: z.string().nullable().optional(),
  slogan: z.string().nullable().optional(),
  countryCode: z.string().min(1, 'El país de operación es requerido'),
  // La zona horaria es OBLIGATORIA desde la creación (no hay default silencioso).
  timezone: z.string().min(1, 'La zona horaria es requerida'),
  currencyFormat: z.enum(['latam', 'usa']).optional(),
  taxId: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  fiscalConfig: FiscalConfigSchema.nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  settings: z.record(z.string(), z.string()).optional(),
});

const uploadPresignedSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.string().min(1),
    folder: z.string().optional(),
    customName: z.string().optional(),
  })
  .strict();

/** La org destino de un upload de plataforma siempre se valida contra la DB. */
async function assertOrganizationExists(c: Context<AppEnv>, orgId: string): Promise<void> {
  const repo = createOrganizationsRepository(c.get('db'));
  const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));
  const org = await service.findOrganizationById(orgId);
  if (!org) {
    throw new HTTPException(404, { message: 'Organización no encontrada' });
  }
}

const provisionOwnerSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  role: z.enum(['owner', 'manager', 'cashier', 'coach', 'member']).optional(),
  isActive: z.boolean().optional(),
  sendInvite: z.boolean().optional(),
  phoneNumber: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
});

export const platformOrganizationRoutes = new Hono<AppEnv>()
  // GET /api/platform/organizations
  .get('/', requirePlatformAuth(), async (c) => {
    const query = c.req.query('query');
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');
    const includeMemberCount = c.req.query('includeMemberCount') === 'true';

    const cache = createCache(c.env);
    const cacheKey = `platform:organizations:${c.req.url}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const result = await service.getAllOrganizations({
      query,
      page,
      limit,
      includeMemberCount,
    });

    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/platform/organizations/check-slug — disponibilidad en vivo del slug
  .get(
    '/check-slug',
    requirePlatformAuth(),
    zValidator(
      'query',
      z.object({ slug: z.string().min(1, 'El slug es requerido'), excludeId: z.string().optional() }),
    ),
    async (c) => {
      const { slug, excludeId } = c.req.valid('query');
      const repo = createOrganizationsRepository(c.get('db'));
      const existing = await repo.findBySlug(slug);
      if (existing && existing.id !== excludeId) {
        throw new HTTPException(409, {
          message: 'El slug ya está en uso por otra organización',
          res: c.json(
            { error: 'El slug ya está en uso por otra organización', code: 'SLUG_TAKEN' },
            409,
          ),
        });
      }
      return c.json({ available: true });
    },
  )

  // GET /api/platform/organizations/by-slug/:slug
  .get('/by-slug/:slug', requirePlatformAuth(), async (c) => {
    const slug = c.req.param('slug');
    const includeMemberCount = c.req.query('includeMemberCount') === 'true';
    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const org = await service.findOrganizationBySlug(slug, { includeMemberCount });
    if (!org) return c.json({ error: 'Organización no encontrada' }, 404);
    return c.json(org);
  })

  // GET /api/platform/organizations/:id
  .get('/:id', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const org = await service.findOrganizationById(id);
    if (!org) return c.json({ error: 'Organización no encontrada' }, 404);
    return c.json(org);
  })

  // POST /api/platform/organizations
  .post('/', requirePlatformAuth(), zValidator('json', createOrgSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const newOrg = await service.createOrganization(data as any);
    await cache.invalidate('platform:organizations*');
    return c.json(newOrg, 201);
  })

  // PUT /api/platform/organizations/:id
  .put('/:id', requirePlatformAuth(), zValidator('json', createOrgSchema.partial()), async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const updatedOrg = await service.updateOrganization(id, data as any);
    await cache.invalidate('platform:organizations*');
    await cache.invalidateExact(`org:${id}:profile`);
    return c.json(updatedOrg);
  })

  // PATCH /api/platform/organizations/:id
  .patch('/:id', requirePlatformAuth(), zValidator('json', createOrgSchema.partial()), async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    const updatedOrg = await service.updateOrganization(id, data as any);
    await cache.invalidate('platform:organizations*');
    await cache.invalidateExact(`org:${id}:profile`);
    return c.json(updatedOrg);
  })

  // DELETE /api/platform/organizations/:id
  .delete('/:id', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const cache = createCache(c.env);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));

    await service.deleteOrganization(id);
    await cache.invalidate('platform:organizations*');
    await cache.invalidateExact(`org:${id}:profile`);
    return c.json({ success: true });
  })

  // POST /api/platform/organizations/:id/ai-credits — grant manual de créditos IA (tests / top-up)
  .post(
    '/:id/ai-credits',
    requirePlatformAuth(),
    zValidator('json', z.object({ credits: z.number().int().min(1).max(1_000_000) })),
    async (c) => {
      const orgId = c.req.param('id');
      const { credits } = c.req.valid('json');
      const cache = createCache(c.env);

      const repo = createOrganizationsRepository(c.get('db'));
      const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));
      const org = await service.findOrganizationById(orgId);
      if (!org) return c.json({ error: 'Organización no encontrada' }, 404);

      const featuresService = createFeaturesService(
        createPlatformSubscriptionsRepository(c.get('db')),
        createPlatformPlansRepository(c.get('db')),
        createPlatformSettingsRepository(c.get('db')),
        createFeaturesRepository(c.get('db')),
        cache,
      );
      const quota = await featuresService.grantAiBonus(orgId, credits);

      // Bonus no está en cache de features, pero invalidamos por si la UI lo deriva de ahí
      await cache.invalidateExact(`org:${orgId}:features`);
      await cache.invalidateExact(`platform:ai-usage:${orgId}`);

      return c.json({
        success: true,
        granted: credits,
        monthly: quota.monthly,
        remaining: quota.remaining,
        periodStart: quota.periodStart,
      });
    },
  )

  // GET /api/platform/organizations/:id/ai-usage — lectura de cuota IA por org (console)
  .get('/:id/ai-usage', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    const cache = createCache(c.env);

    const cacheKey = `platform:ai-usage:${orgId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));
    const org = await service.findOrganizationById(orgId);
    if (!org) return c.json({ error: 'Organización no encontrada' }, 404);

    const featuresService = createFeaturesService(
      createPlatformSubscriptionsRepository(c.get('db')),
      createPlatformPlansRepository(c.get('db')),
      createPlatformSettingsRepository(c.get('db')),
      createFeaturesRepository(c.get('db')),
      cache,
    );
    const quota = await featuresService.getAiQuota(orgId);
    const payload = {
      monthly: quota.monthly,
      remaining: quota.remaining,
      disabled: quota.disabled,
      periodStart: quota.periodStart,
    };
    await cache.set(cacheKey, payload, 300);
    return c.json(payload);
  })

  // GET /api/platform/organizations/:id/gym-overview — adopción gym + portal (console).
  // Staleness aceptada (5 min): los writes del gym no invalidan claves platform.
  .get('/:id/gym-overview', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    const cache = createCache(c.env);

    const cacheKey = `platform:gym-overview:${orgId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo, createSettingsRepository(c.get('db')));
    const org = await service.findOrganizationById(orgId);
    if (!org) return c.json({ error: 'Organización no encontrada' }, 404);

    const featuresService = createFeaturesService(
      createPlatformSubscriptionsRepository(c.get('db')),
      createPlatformPlansRepository(c.get('db')),
      createPlatformSettingsRepository(c.get('db')),
      createFeaturesRepository(c.get('db')),
      cache,
    );
    const overview = await featuresService.getGymOverview(orgId);
    await cache.set(cacheKey, overview, 300);
    return c.json(overview);
  })

  // GET /api/platform/organizations/:id/subscriptions
  .get('/:id/subscriptions', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const plansRepo = createPlatformPlansRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo, plansRepo);

    const subscriptions = await service.getSubscriptionsByOrganization(id);
    return c.json(subscriptions);
  })

  // POST /api/platform/organizations/:id/subscriptions
  .post(
    '/:id/subscriptions',
    requirePlatformAuth(),
    zValidator(
      'json',
      z.object({
        planId: z.number().int().positive(),
        startDate: z.string().optional(),
        isTrial: z.boolean().default(false),
        priceOverrideCents: z.number().int().nonnegative().optional(),
        payment: z.object({
          amountPaidCents: z.number().int().nonnegative(),
          currencyPaid: z.string().min(1),
          exchangeRateApplied: z.string().optional(),
          baseAmountCents: z.number().int().nonnegative().optional(),
          paymentMethod: z.string().min(1),
          paymentMethodDetails: paymentMethodDetailsSchema,
          status: z.enum([
            PAYMENT_STATUSES.PROCESSING,
            PAYMENT_STATUSES.VALIDATED,
            PAYMENT_STATUSES.VOIDED,
            PAYMENT_STATUSES.REFUNDED,
          ]),
          paymentDate: z.string().optional(),
        }),
      })
    ),
    async (c) => {
      const id = c.req.param('id');
      const data = c.req.valid('json');
      const cache = createCache(c.env);

      const repo = createPlatformSubscriptionsRepository(c.get('db'));
      const plansRepo = createPlatformPlansRepository(c.get('db'));
      const service = createPlatformSubscriptionsService(repo, plansRepo);

      const result = await service.createSubscriptionWithPayment({
        organizationId: id,
        ...data,
      });

      await cache.invalidate('platform:subscriptions*');
      await cache.invalidateExact(`org:${id}:subscription-status`);

      const created = await service.getSubscriptionById(result.subscriptionId);
      return c.json(created, 201);
    }
  )

  // GET /api/platform/organizations/:id/staff
  .get('/:id/staff', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const membersRepo = createMembersRepository(c.get('db'));

    const staffMembers = await membersRepo.findAll({
      organizationId: id,
      excludeRole: 'member',
    });

    return c.json(staffMembers.data);
  })

  // POST /api/platform/organizations/:id/staff
  .post(
    '/:id/staff',
    requirePlatformAuth(),
    zValidator('json', provisionOwnerSchema),
    async (c) => {
      const id = c.req.param('id');
      const { sendInvite, ...memberData } = { ...DEFAULT_ORG_STAFF_VALUES, ...c.req.valid('json') };

      const membersRepo = createMembersRepository(c.get('db'));
      const usersRepo = createUsersRepository(c.get('db'));
      const tokenService = createTokenService(c.env.JWT_SECRET);
      const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

      const auth = c.get('auth');
      const cache = createCache(c.env);

      // Provision or update gym_member entry
      const newMember = await membersService.createMember(id, memberData as any, sendInvite, {
        auth,
        headers: c.req.raw.headers,
      });

      // If existing user is in the database, link them to auth_member with owner role
      const existingUser = await usersRepo.findByEmail(memberData.email);
      if (existingUser) {
        const isAlreadyAuthMember = await membersRepo.findAuthMember(existingUser.id, id);
        if (!isAlreadyAuthMember) {
          await membersRepo.addToOrganization(existingUser.id, id, memberData.role as any);
        }
      }

      await cache.invalidate(`org:${id}:members:*`);
      return c.json(newMember, 201);
    }
  )

  // POST /api/platform/organizations/:id/join
  .post('/:id/join', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const membersRepo = createMembersRepository(c.get('db'));
    const newMember = await membersRepo.addToOrganization(user.id, id, 'owner');

    const cache = createCache(c.env);
    await cache.invalidate(`org:${id}:members:*`);

    return c.json({
      success: true,
      message: 'Te has unido exitosamente a la organización',
      data: newMember,
    });
  })

  // POST /api/platform/organizations/:id/staff/:memberId/resend-invite
  .post('/:id/staff/:memberId/resend-invite', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const memberId = Number(c.req.param('memberId'));

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const auth = c.get('auth');
    const result = await membersService.resendInvite(id, memberId, {
      auth,
      headers: c.req.raw.headers,
    });

    return c.json({
      message: 'Invitación reenviada exitosamente',
      ...result,
    });
  })

  // ---------------------------------------------------------------------------
  // Assets DE LA ORGANIZACIÓN desde el console.
  //
  // El console no tiene organización activa en la sesión: la org destino viaja
  // por PATH (`:id`), nunca por body/query, y cada request valida que exista +
  // que la key caiga dentro de `<orgId>/`. Mismo contrato de keys que el panel.
  // ---------------------------------------------------------------------------

  // GET /api/platform/organizations/:id/upload?folder=
  .get('/:id/upload', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    await assertOrganizationExists(c, orgId);

    const folder = c.req.query('folder');
    const r2Service = createR2Service(c.env);
    return c.json(await r2Service.listFiles(orgStorageListPrefix(orgId, folder)));
  })

  // GET /api/platform/organizations/:id/upload/file?key=<orgId>/… — entrega
  // autenticada para el console (logo de org, evidencia de pago).
  .get('/:id/upload/file', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    const key = c.req.query('key');

    await assertOrganizationExists(c, orgId);
    if (!key) return c.json({ error: 'Key is required' }, 400);
    if (!isOrgStorageKey(orgId, key)) {
      return c.json({ error: 'Forbidden: No tienes permiso para ver este archivo.' }, 403);
    }

    const file = await createR2Service(c.env).getFile(key);
    if (!file) return c.json({ error: 'Archivo no encontrado' }, 404);

    return new Response(file.bytes, {
      headers: {
        'content-type': file.contentType,
        'cache-control': 'private, max-age=300',
      },
    });
  })

  // DELETE /api/platform/organizations/:id/upload?key=<orgId>/…
  .delete('/:id/upload', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    const key = c.req.query('key');

    await assertOrganizationExists(c, orgId);
    if (!key) return c.json({ error: 'Key is required' }, 400);
    if (!isOrgStorageKey(orgId, key)) {
      return c.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, 403);
    }

    await createR2Service(c.env).deleteFile(key);
    return c.json({ success: true });
  })

  // PUT /api/platform/organizations/:id/upload/direct?key=<orgId>/…
  .put('/:id/upload/direct', requirePlatformAuth(), async (c) => {
    const orgId = c.req.param('id');
    const key = c.req.query('key');

    await assertOrganizationExists(c, orgId);
    if (!key) return c.json({ error: 'Key is required' }, 400);
    if (!isOrgStorageKey(orgId, key)) {
      return c.json({ error: 'Forbidden: No tienes permiso para subir este archivo.' }, 403);
    }
    if (!c.env.FILES_BUCKET) {
      return c.json({ error: 'FILES_BUCKET binding is missing' }, 500);
    }

    const contentType = c.req.header('content-type') || 'application/octet-stream';
    const body = await c.req.arrayBuffer();

    await c.env.FILES_BUCKET.put(key, body, {
      httpMetadata: { contentType },
    });

    return c.json({ success: true, key });
  })

  // POST /api/platform/organizations/:id/upload/presigned
  .post(
    '/:id/upload/presigned',
    requirePlatformAuth(),
    zValidator('json', uploadPresignedSchema),
    async (c) => {
      const orgId = c.req.param('id');
      await assertOrganizationExists(c, orgId);

      const body = c.req.valid('json');
      const uniqueKey = constructStorageKey(orgId, body.folder, body.filename, body.customName);
      const r2Service = createR2Service(c.env);
      const requestUrl = new URL(c.req.url);
      const uploadBaseUrl = `${requestUrl.protocol}//${requestUrl.host}/api/platform/organizations/${orgId}/upload`;
      const result = await r2Service.getUploadUrl(uniqueKey, uploadBaseUrl);

      return c.json(result);
    },
  );
