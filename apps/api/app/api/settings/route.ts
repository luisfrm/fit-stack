import { NextResponse } from "next/server";
import { settingsService } from "@/services/settings.service";
import { cache } from "@/lib/cache";
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@workspace/shared";
import { withAuth } from "@/lib/route-handler";

export const GET = withAuth(PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const cacheKey = `org:${organizationId}:settings`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const settings = await settingsService.getAll(organizationId);

    await cache.set(cacheKey, settings, 600);

    return NextResponse.json(settings);
  }
)

export const POST = withAuth(PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.UPDATE)(
  async (req, { organizationId }) => {
    const settings = await req.json();
    await settingsService.updateAll(organizationId, settings);

    await cache.invalidate(`org:${organizationId}:settings*`);

    return NextResponse.json({ success: true });
  }
)
