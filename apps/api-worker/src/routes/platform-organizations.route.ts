import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requirePlatformAuth } from '../lib/route-handler';
import { createOrganizationsRepository } from '../repositories/organizations.repository';
import { createOrganizationsService } from '../services/organizations.service';
import { createMembersRepository } from '../repositories/members.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformSubscriptionsService } from '../services/platform-subscriptions.service';
import { createCache } from '../lib/cache';
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
    return c.json({ success: true });
  })

  // GET /api/platform/organizations/:id/subscriptions
  .get('/:id/subscriptions', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const repo = createPlatformSubscriptionsRepository(c.get('db'));
    const service = createPlatformSubscriptionsService(repo);

    const subscriptions = await service.getSubscriptionsByOrganization(id);
    return c.json(subscriptions);
  })

  // GET /api/platform/organizations/:id/staff
  .get('/:id/staff', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    const membersRepo = createMembersRepository(c.get('db'));

    const staffMembers = await membersRepo.findAll({
      organizationId: id,
      excludeRole: 'member',
    });

    return c.json(staffMembers.data);
  });
