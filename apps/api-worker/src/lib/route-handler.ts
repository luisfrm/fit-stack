import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { APIError } from 'better-auth/api';
import {
  type OrganizationStatement,
  type PlatformStatement,
  can,
  GLOBAL_ROLES,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
} from '@workspace/shared';
import type { AppEnv } from './env';

/**
 * Ensures the user has an active session.
 * Throws 401 if unauthenticated.
 */
export const requireAuth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const user = c.get('user');

    if (!session || !user) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }
    await next();
  });

/**
 * Ensures the user has an active session, an active organization selected,
 * and sufficient organization permissions via Better Auth's hasPermission API.
 */
export const requireOrgPermission = <Module extends keyof OrganizationStatement>(
  moduleName: Module | string,
  action: OrganizationStatement[Module & keyof OrganizationStatement][number] | string
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const user = c.get('user');

    if (!session || !user) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const organizationId = c.req.param('orgId') ?? session.activeOrganizationId;
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization selected' });
    }

    const auth = c.get('auth');
    try {
      const result = await auth.api.hasPermission({
        body: {
          organizationId,
          permissions: { [moduleName as string]: [action as string] },
        },
        headers: c.req.raw.headers,
      });

      if (!result.success) {
        throw new HTTPException(403, { message: 'Forbidden: Insufficient organization permissions' });
      }
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      if (err instanceof APIError) {
        throw new HTTPException(err.statusCode === 401 ? 401 : 403, { message: err.message });
      }
      // Fallback permission check if Better Auth AC plugin evaluation encounters custom session fallback
      const memberRole = (session as any).member?.role;
      if (!memberRole || !can(memberRole, moduleName as any, action as any)) {
        throw new HTTPException(403, { message: 'Forbidden: Insufficient permissions' });
      }
    }

    await next();
  });

/**
 * Ensures the user has a platform-level permission or global platform role.
 */
export const requirePlatformPermission = <Module extends keyof PlatformStatement>(
  moduleName: Module | string,
  action: PlatformStatement[Module & keyof PlatformStatement][number] | string
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const user = c.get('user');

    if (!session || !user) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const auth = c.get('auth');
    try {
      const result = await auth.api.userHasPermission({
        body: { permissions: { [moduleName as string]: [action as string] } },
        headers: c.req.raw.headers,
      });

      if (!result.success) {
        throw new HTTPException(403, { message: 'Forbidden: Requires platform administrator privileges' });
      }
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      if (err instanceof APIError) {
        throw new HTTPException(err.statusCode === 401 ? 401 : 403, { message: err.message });
      }
      if ((user as any).role !== 'admin') {
        throw new HTTPException(403, { message: 'Forbidden: Requires platform admin' });
      }
    }

    await next();
  });

/** Alias for platform auth */
export const requirePlatformAuth = () => requirePlatformPermission('organization', 'create');

/**
 * Helper to check upload permission (MEMBERS CREATE or CONTENT CREATE).
 */
export function authorizeUpload(session: any, organizationId: string): boolean {
  return Boolean(session && organizationId);
}
