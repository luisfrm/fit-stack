import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { APIError } from 'better-auth/api';
import {
  type OrganizationStatement,
  type PlatformStatement,
  type FeatureId,
  can,
  canPlatform,
} from '@workspace/shared';
import type { AppEnv } from './env';
import { createCache } from './cache';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createFeaturesService } from '../services/features.service';

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
    c.set('orgId', organizationId);

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
      // Fail-closed fallback: the platform matrix decides, never a role list.
      const platformRole = (user as { role?: string }).role;
      if (
        !canPlatform(
          platformRole,
          moduleName as keyof PlatformStatement,
          action as string,
        )
      ) {
        throw new HTTPException(403, {
          message: 'Forbidden: Insufficient platform permissions',
        });
      }
    }

    await next();
  });

/** Alias for platform auth */
export const requirePlatformAuth = () => requirePlatformPermission('organization', 'create');

/**
 * Resolves active organization timezone from session and stores it
 * in `c.get('orgTimezone')` (typed). It is MANDATORY: if missing, throws 500 —
 * never uses a silent fallback assigning an incorrect tz.
 * Compose AFTER `requireOrgPermission`/`requireAuth` (requires session).
 */
export const requireOrgTimezone = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const org = c.get('org');
    const timezone = org?.timezone;
    if (!timezone?.trim()) {
      throw new HTTPException(500, {
        message: 'La organización no tiene una zona horaria configurada',
      });
    }
    c.set('orgTimezone', timezone);
    await next();
  });

/**
 * Resolves the active organization primary currency and stores it in
 * `c.get('orgCurrency')` (typed). It is MANDATORY for money normalization:
 * if missing, throws 500 — never assumes a currency.
 * Compose AFTER `requireOrgPermission`/`requireAuth`.
 */
export const requireOrgCurrency = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const primaryCurrency = c.get('org')?.primaryCurrency;
    if (!primaryCurrency?.trim()) {
      throw new HTTPException(500, {
        message: 'La organización no tiene una moneda primaria configurada',
      });
    }
    c.set('orgCurrency', primaryCurrency);
    await next();
  });

/**
 * Ensures an active organization and sets it in `c.get('orgId')` (typed).
 * Useful for org-scoped routes without permission checks (e.g. upload).
 * Compose AFTER `requireAuth`.
 */
export const requireOrg = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const organizationId = c.req.param('orgId') ?? c.get('session')?.activeOrganizationId;
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization selected' });
    }
    c.set('orgId', organizationId);
    await next();
  });

/**
 * Constructs features service for the request context.
 */
function buildFeaturesService(c: Context<AppEnv>) {
  const db = c.get('db');
  const cache = createCache(c.env);
  const subsRepo = createPlatformSubscriptionsRepository(db);
  const plansRepo = createPlatformPlansRepository(db);
  const settingsRepo = createPlatformSettingsRepository(db);
  const featuresRepo = createFeaturesRepository(db);
  return createFeaturesService(subsRepo, plansRepo, settingsRepo, featuresRepo, cache);
}

/**
 * Feature guard: verifies active plan includes the feature.
 * Compose AFTER `requireOrgPermission` (RBAC = role; features = contracted).
 * Missing feature → 403 { error, code: 'FEATURE_NOT_AVAILABLE', feature }.
 */
export const requireFeature = (featureId: FeatureId) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const organizationId = c.req.param('orgId') ?? session?.activeOrganizationId;
    if (!organizationId) {
      throw new HTTPException(400, { message: 'No active organization selected' });
    }

    const service = buildFeaturesService(c);
    const orgFeatures = await service.getOrgFeatures(organizationId);

    if (!orgFeatures.features[featureId]?.enabled) {
      throw new HTTPException(403, {
        message: 'Feature no disponible en tu plan',
        res: c.json(
          {
            error: 'Feature no disponible en tu plan',
            code: 'FEATURE_NOT_AVAILABLE',
            feature: featureId,
          },
          403
        ),
      });
    }

    c.set('orgFeatures', orgFeatures);
    await next();
  });
