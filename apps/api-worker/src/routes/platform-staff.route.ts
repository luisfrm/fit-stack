import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, requirePlatformAuth } from '../lib/route-handler';
import { createUsersRepository } from '../repositories/users.repository';
import { createTokenService } from '../services/token.service';
import { createCache } from '../lib/cache';
import { canAssignPlatformRole, platformRoles, type PlatformRole } from '@workspace/shared';
import type { AppEnv } from '../lib/env';

/**
 * Platform staff (SaaS admins) — users with a global platform role (support/admin/owner).
 * Role values come from `platformRoles` keys (no magic strings).
 */
const platformRoleValues = Object.keys(platformRoles) as [string, ...string[]];

const createStaffSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').optional(),
  email: z.string().email('Email inválido'),
  role: z.enum(platformRoleValues).default('admin'),
  sendInvite: z.boolean().default(false),
});

export const platformStaffRoutes = new Hono<AppEnv>()
  // GET /api/platform/staff
  .get('/', requirePlatformAuth(), async (c) => {
    const cache = createCache(c.env);
    const cached = await cache.get('platform:staff');
    if (cached) return c.json(cached);

    const usersRepo = createUsersRepository(c.get('db'));
    const staff = await usersRepo.findPlatformStaff();

    const result = staff.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role,
      emailVerified: u.emailVerified,
      banned: u.banned,
      createdAt: u.createdAt,
    }));

    await cache.set('platform:staff', result, 300);
    return c.json(result);
  })

  // POST /api/platform/staff
  .post('/', requirePlatformAuth(), zValidator('json', createStaffSchema), async (c) => {
    const data = c.req.valid('json');
    // Session user type omits `role` (additionalFields has input:false), so cast like route-handler does.
    const actor = c.get('user') as { role?: string } | undefined;
    const actorRole = (actor?.role || 'user') as PlatformRole;

    // Anti-escalation: only `owner` can assign `owner`; `admin` can assign `support`/`admin`.
    if (!canAssignPlatformRole(actorRole, data.role as PlatformRole)) {
      return c.json({ error: 'Forbidden: No puedes asignar el rol seleccionado' }, 403);
    }

    const usersRepo = createUsersRepository(c.get('db'));
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const cache = createCache(c.env);

    const existing = await usersRepo.findByEmail(data.email);

    // Case 1: user exists → grant platform access by updating their global role.
    if (existing) {
      await usersRepo.update(existing.id, { role: data.role });
      await cache.invalidate('platform:staff*');
      return c.json({
        status: 'granted',
        user: { id: existing.id, name: existing.name, email: existing.email, role: data.role },
      });
    }

    // Case 2: user doesn't exist → send registration invite pointing to Console.
    const token = await tokenService.signConsoleInviteToken(data.email, data.role);
    if (c.env.TASK_QUEUE) {
      await c.env.TASK_QUEUE.send({
        type: 'email.registration_invite',
        email: data.email,
        token,
        target: 'console',
        role: data.role,
      });
    }

    await cache.invalidate('platform:staff*');
    return c.json({ status: 'invited', email: data.email, role: data.role }, 201);
  })

  // GET /api/platform/staff/validate-token?token=...
  .get('/validate-token', async (c) => {
    const token = c.req.query('token');
    if (!token) {
      return c.json({ error: 'Token es requerido' }, 400);
    }

    const tokenService = createTokenService(c.env.JWT_SECRET);
    try {
      const payload = await tokenService.verifyConsoleInviteToken(token);
      return c.json({ valid: true, email: payload.email, role: payload.role });
    } catch {
      return c.json({ valid: false, error: 'Token inválido o expirado' }, 400);
    }
  })

  // POST /api/platform/staff/accept
  .post('/accept', requireAuth(), async (c) => {
    const { token } = await c.req.json<{ token?: string }>();
    if (!token) {
      return c.json({ error: 'Token es requerido' }, 400);
    }

    const user = c.get('user')!;
    const tokenService = createTokenService(c.env.JWT_SECRET);
    const usersRepo = createUsersRepository(c.get('db'));
    const cache = createCache(c.env);

    try {
      const payload = await tokenService.verifyConsoleInviteToken(token);

      if (payload.email && payload.email !== user.email) {
        return c.json({ error: 'La invitación pertenece a otro correo' }, 400);
      }

      const role = payload.role || 'admin';
      await usersRepo.update(user.id, { role });
      await cache.invalidate('platform:staff*');

      return c.json({ success: true, role });
    } catch (error: any) {
      return c.json({ error: error.message || 'Token inválido o expirado' }, 400);
    }
  })

  // DELETE /api/platform/staff/:id — revoke platform access (role → 'user')
  .delete('/:id', requirePlatformAuth(), async (c) => {
    const id = c.req.param('id');
    // Session user type omits `role` (additionalFields has input:false), so cast like route-handler does.
    const actor = c.get('user') as { id: string; role?: string };
    const actorRole = (actor.role || 'user') as PlatformRole;

    const usersRepo = createUsersRepository(c.get('db'));
    const cache = createCache(c.env);

    const target = await usersRepo.findById(id);
    if (!target) {
      return c.json({ error: 'Usuario no encontrado' }, 404);
    }

    if (target.id === actor.id) {
      return c.json({ error: 'No puedes revocar tu propio acceso' }, 400);
    }

    if (target.role && target.role in platformRoles) {
      // Same anti-escalation rule: you can only revoke roles you could assign.
      if (!canAssignPlatformRole(actorRole, target.role as PlatformRole)) {
        return c.json({ error: 'Forbidden: No puedes revocar el rol seleccionado' }, 403);
      }

      // Never remove the last owner.
      if (target.role === 'owner') {
        const ownerCount = await usersRepo.countByRole('owner');
        if (ownerCount <= 1) {
          return c.json({ error: 'No puedes revocar al último propietario de la plataforma' }, 400);
        }
      }
    }

    await usersRepo.update(target.id, { role: 'user' });
    await cache.invalidate('platform:staff*');
    return c.json({ success: true });
  });
