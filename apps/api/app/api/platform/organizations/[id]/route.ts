import { NextRequest, NextResponse } from 'next/server';
import { organizationsService } from '@/services/organizations.service';
import { settingsService } from '@/services/settings.service';
import { getSession } from '@/config/get-session';
import { canManageOrganization } from '@/config/auth-utils';

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

    if (!canManageOrganization(session, id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch organization basic info
    const organization = await organizationsService.getOrganizationById(id);

    // 2. Fetch specialized settings (branding, timezone, etc.)
    const settings = await settingsService.getAll(id);

    return NextResponse.json({
      ...organization,
      settings
    });
  } catch (error: any) {
    const status = error.message === 'Organización no encontrada' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
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

    if (!canManageOrganization(session, id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { settings, ...orgData } = body;

    // 1. Update settings if provided
    if (settings) {
      await settingsService.updateAll(id, settings);
    }

    // 2. Update basic organization info if provided
    let updatedOrg = null;
    if (Object.keys(orgData).length > 0) {
      updatedOrg = await organizationsService.updateOrganization(id, orgData);
    } else {
      updatedOrg = await organizationsService.getOrganizationById(id);
    }

    return NextResponse.json(updatedOrg);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
