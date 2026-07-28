import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { can, PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared';
import type { AppEnv } from './env';

/**
 * Ensures the user has an active session.
 * Throws 401 if unauthenticated.
 */
export const requireAuth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    if (!session) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }
    await next();
  });

/**
 * Ensures the user has an active session, an active organization selected,
 * and sufficient organization role permissions for the given module & action.
 */
export const requireOrgPermission = (
  moduleName: keyof typeof PERMISSION_MODULES | string,
  action: keyof typeof PERMISSION_ACTIONS | string
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const user = c.get('user');
    
    if (!session || !user) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const organizationId = session.activeOrganizationId;
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization selected' });
    }

    const memberRole = (session as any).member?.role;
    if (!memberRole) {
      throw new HTTPException(403, { message: 'Forbidden: No organization membership found' });
    }

    const hasAccess = can(memberRole, moduleName as any, action as any);
    if (!hasAccess) {
      throw new HTTPException(403, { message: 'Forbidden: Insufficient organization permissions' });
    }

    await next();
  });

/**
 * Ensures the user has a global platform role of 'admin'.
 * Throws 403 if the user is not a SaaS super-admin.
 */
export const requirePlatformAuth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const user = c.get('user');

    if (!session || !user) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    if ((user as any).role !== 'admin') {
      throw new HTTPException(403, { message: 'Forbidden: Requires platform administrator privileges' });
    }

    await next();
  });

/**
 * Helper to check upload permission (MEMBERS CREATE or CONTENT CREATE).
 */
export function authorizeUpload(session: any, organizationId: string): boolean {
  if (!session || !organizationId) return false;
  const memberRole = session.member?.role;
  if (!memberRole) return false;

  const canCreateMembers = can(memberRole, PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.CREATE);
  const canCreateContent = can(memberRole, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.CREATE);

  return canCreateMembers || canCreateContent;
}
