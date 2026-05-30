import { NextResponse, NextRequest } from "next/server";
import { getSession } from "@/config/get-session";
import { settingsService } from "@/services/settings.service";
import { cache } from "@/lib/cache";
import { authorize, requireGlobalAdmin } from "@/config/auth-utils";
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@workspace/shared";

export async function GET() {
  try {
    const session = await getSession();
    const organizationId = session?.session?.activeOrganizationId;

    if (!organizationId) {
      if (!requireGlobalAdmin(session)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (!authorize(session, organizationId, PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cacheKey = `org:${organizationId || 'global'}:settings`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const settings = await settingsService.getAll(organizationId || null);

    await cache.set(cacheKey, settings, 600);

    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const organizationId = session?.session?.activeOrganizationId;

    if (!organizationId) {
      if (!requireGlobalAdmin(session)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (!authorize(session, organizationId, PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await req.json();
    await settingsService.updateAll(organizationId || null, settings);

    await cache.invalidate(`org:${organizationId || 'global'}:settings*`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
