import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createOrganizationsService } from '../services/organizations.service';
import { createMembersRepository } from '../repositories/members.repository';
import { createUsersRepository } from '../repositories/users.repository';
import { createTokenService } from '../services/token.service';
import { createMembersService } from '../services/members.service';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createCache } from '../lib/cache';
import { PAYMENT_STATUSES } from '@workspace/shared/constants';
import type { AppEnv } from '../lib/env';

const createOrgSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z.string().optional(),
  logo: z.string().nullable().optional(),
  countryCode: z.string().optional(),
  taxId: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  fiscalConfig: z.record(z.string(), z.any()).nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
});

const provisionOwnerSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  role: z.enum(['owner', 'manager', 'cashier', 'coach', 'member']).optional().default('owner'),
  isActive: z.boolean().optional().default(true),
  sendInvite: z.boolean().optional().default(false),
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
    const service = createOrganizationsService(repo);

    const result = await service.getAllOrganizations({
      query,
      page,
      limit,
      includeMemberCount,
    });

    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/platform/organizations/:id
  .get('/:id', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo);

    const org = await service.getOrganizationById(id);
    return c.json(org);
  })

  // POST /api/platform/organizations
  .post('/', requirePlatformAuth(), zValidator('json', createOrgSchema), async (c) => {
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const repo = createOrganizationsRepository(c.get('db'));
    const service = createOrganizationsService(repo);

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
    const service = createOrganizationsService(repo);

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
    const service = createOrganizationsService(repo);

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
    const service = createOrganizationsService(repo);

    await service.deleteOrganization(id);
    await cache.invalidate('platform:organizations*');
    await cache.invalidateExact(`org:${id}:profile`);
    return c.json({ success: true });
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
          paymentMethodDetails: z.record(z.string(), z.any()).optional(),
          status: z.enum([
            PAYMENT_STATUSES.PENDING,
            PAYMENT_STATUSES.PROCESSING,
            PAYMENT_STATUSES.VALIDATED,
            PAYMENT_STATUSES.INVALID,
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
      const { sendInvite, ...memberData } = c.req.valid('json');

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
          await membersRepo.addToOrganization(existingUser.id, id, (memberData.role as any) || 'owner');
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
  });
