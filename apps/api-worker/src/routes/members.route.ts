import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, requireOrgPermission } from '../lib/route-handler';
import { PERMISSION_MODULES as PM, PERMISSION_ACTIONS as PA } from '@workspace/shared';
import { createMembersRepository } from '../repositories/members.repository';
import { createUsersRepository } from '../repositories/users.repository';
import { createTokenService } from '../services/token.service';
import { createMembersService } from '../services/members.service';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const memberSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  documentId: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  role: z.enum(['owner', 'manager', 'cashier', 'coach', 'member']).default('member'),
  isActive: z.boolean().default(true),
  sendInvite: z.boolean().default(false),
});

export const memberRoutes = new Hono<AppEnv>()
  // GET /api/members
  .get('/', requireOrgPermission(PM.MEMBERS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const query = c.req.query('query');
    const role = c.req.query('role') as any;
    const excludeRole = c.req.query('excludeRole') as any;
    const isActiveStr = c.req.query('isActive');
    const isActive = isActiveStr !== undefined ? isActiveStr === 'true' : undefined;
    const page = Number(c.req.query('page') || '1');
    const limit = Number(c.req.query('limit') || '10');
    const includeLatestSubscription = c.req.query('includeLatestSubscription') === 'true';

    const cache = createCache(c.env);
    const cacheKey = `org:${orgId}:members:${c.req.url}`;
    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const result = await membersService.getAllMembers({
      organizationId: orgId,
      query,
      role,
      excludeRole,
      isActive,
      page,
      limit,
      includeLatestSubscription,
    });

    await cache.set(cacheKey, result, 300);
    return c.json(result);
  })

  // GET /api/members/me
  .get('/me', requireAuth(), async (c) => {
    const session = c.get('session')!;
    const user = c.get('user')!;
    const orgId = session.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: 'No active organization' }, 400);
    }

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const member = await membersService.getMemberByUserId(orgId, user.id);
    return c.json(member || null);
  })

  // GET /api/members/validate-token?token=...
  .get('/validate-token', async (c) => {
    const token = c.req.query('token');
    if (!token) {
      return c.json({ error: 'Token is required' }, 400);
    }

    const tokenService = createTokenService(c.env.JWT_SECRET);
    try {
      const payload = await tokenService.verifyInviteToken(token);
      const membersRepo = createMembersRepository(c.get('db'));
      const member = await membersRepo.findById(payload.organizationId, payload.memberId);

      if (!member) {
        return c.json({ valid: false, error: 'Miembro no encontrado' }, 404);
      }

      if (member.userId) {
        return c.json({ valid: false, error: 'Esta invitación ya fue utilizada' }, 400);
      }

      return c.json({
        valid: true,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
      });
    } catch {
      return c.json({ valid: false, error: 'Token inválido o expirado' }, 400);
    }
  })
  // POST /api/members/link-user
  .post('/link-user', requireAuth(), async (c) => {
    const { token } = await c.req.json<{ token?: string }>();
    if (!token) {
      return c.json({ error: 'Token es requerido' }, 400);
    }

    const tokenService = createTokenService(c.env.JWT_SECRET);
    const user = c.get('user')!;

    try {
      const payload = await tokenService.verifyInviteToken(token);
      const organizationId = payload.organizationId;
      const membersRepo = createMembersRepository(c.get('db'));

      const member = await membersRepo.findById(organizationId, payload.memberId);
      if (!member) {
        return c.json({ error: 'Miembro no encontrado' }, 404);
      }

      if (member.userId && member.userId !== user.id) {
        return c.json({ error: 'Este miembro ya está vinculado a otra cuenta' }, 400);
      }

      // 1. Link user ID to gymMember record
      await membersRepo.update(organizationId, member.id, { userId: user.id });

      // 2. Add user to organization membership
      await membersRepo.addToOrganization(user.id, organizationId, member.role);

      // 3. Set active organization for current session
      const auth = c.get('auth');
      await auth.api.setActiveOrganization({
        headers: c.req.raw.headers,
        body: { organizationId },
      });

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ error: error.message || 'Token inválido o expirado' }, 400);
    }
  })

  // GET /api/members/:id
  .get('/:id', requireOrgPermission(PM.MEMBERS, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const member = await membersService.getMemberById(orgId, id);
    return c.json(member);
  })

  // POST /api/members
  .post('/', requireOrgPermission(PM.MEMBERS, PA.CREATE), zValidator('json', memberSchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const { sendInvite, ...data } = c.req.valid('json');
    const auth = c.get('auth');
    const cache = createCache(c.env);

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const newMember = await membersService.createMember(orgId, data as any, sendInvite, {
      auth,
      headers: c.req.raw.headers,
    });

    await cache.invalidate(`org:${orgId}:members:*`);
    return c.json(newMember, 201);
  })

  // PUT /api/members/:id
  .put('/:id', requireOrgPermission(PM.MEMBERS, PA.UPDATE), zValidator('json', memberSchema.partial()), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');
    const cache = createCache(c.env);

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const updatedMember = await membersService.updateMember(orgId, id, data as any);
    await cache.invalidate(`org:${orgId}:members:*`);
    return c.json(updatedMember);
  })

  // DELETE /api/members/:id
  .delete('/:id', requireOrgPermission(PM.MEMBERS, PA.DELETE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const cache = createCache(c.env);

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    await membersService.deleteMember(orgId, id);
    await cache.invalidate(`org:${orgId}:members:*`);
    return c.json({ success: true });
  })

  // POST /api/members/:id/resend-invite
  .post('/:id/resend-invite', requireOrgPermission(PM.MEMBERS, PA.UPDATE), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const id = Number(c.req.param('id'));
    const auth = c.get('auth');

    const membersRepo = createMembersRepository(c.get('db'));
    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const membersService = createMembersService(membersRepo, usersRepo, tokenService, c.env.TASK_QUEUE);

    const result = await membersService.resendInvite(orgId, id, {
      auth,
      headers: c.req.raw.headers,
    });

    return c.json(result);
  });
