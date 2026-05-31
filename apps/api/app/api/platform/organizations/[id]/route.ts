import { NextRequest, NextResponse } from 'next/server';
import { organizationsService } from '@/services/organizations.service';
import { settingsService } from '@/services/settings.service';
import { getSession } from '@/config/get-session';
import { authorize } from '@/config/auth-utils';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared';
import { cache } from '@/lib/cache';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/platform/organizations/[id]
 * Retrieves organization details plus its technical settings.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!await authorize(session, id, PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = `platform:organizations:${id}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const organization = await organizationsService.getOrganizationById(id);
    const settings = await settingsService.getAll(id);

    const data = {
      ...organization,
      settings
    }
    await cache.set(cacheKey, data, 300)

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    const status = message === 'Organización no encontrada' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/platform/organizations/[id]
 * Updates organization details and/or its technical settings.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!await authorize(session, id, PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { settings, ...orgData } = body;

    if (settings) {
      await settingsService.updateAll(id, settings);
    }

    let updatedOrg = null;
    if (Object.keys(orgData).length > 0) {
      updatedOrg = await organizationsService.updateOrganization(id, orgData);
    } else {
      updatedOrg = await organizationsService.getOrganizationById(id);
    }

    await cache.invalidate('platform:organizations*')

    return NextResponse.json(updatedOrg);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
