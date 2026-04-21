import { NextResponse, NextRequest } from "next/server";
import { getSession } from "@/config/get-session";
import { settingsService } from "@/services/settings.service";
import { GLOBAL_ROLES } from "@workspace/shared";
import { cache } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const organizationId = session?.session?.activeOrganizationId;

    // Security & Context Dispatch:
    // 1. If we have an organization ID, regular auth rules apply 
    // (Better Auth handles org access, but we could add more checks here)
    if (!organizationId) {
      // 2. If no organization, ONLY SaaS Admins can access (Global Settings context)
      if (session?.user.role !== GLOBAL_ROLES.ADMIN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const cacheKey = `org:${organizationId || 'global'}:settings`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    // Call service with organizationId (will be null for SaaS Admin without active org)
    const settings = await settingsService.getAll(organizationId || null);

    await cache.set(cacheKey, settings, 600); // 10 mins

    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const organizationId = session?.session?.activeOrganizationId;

    // Security & Context Dispatch:
    if (!organizationId) {
      if (session?.user.role !== GLOBAL_ROLES.ADMIN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const settings = await req.json();
    await settingsService.updateAll(organizationId || null, settings);

    await cache.invalidate(`org:${organizationId || 'global'}:settings*`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
