import { NextResponse, NextRequest } from "next/server";
import { getSession } from "@/config/get-session";
import { settingsService } from "@/services/settings.service";
import { cache } from "@/lib/cache";
import { requireGlobalAdmin } from "@/config/auth-utils";

export async function GET() {
  try {
    const session = await getSession();

    if (!requireGlobalAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = "platform:settings";
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const settings = await settingsService.getAll(null);

    await cache.set(cacheKey, settings, 600);

    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!requireGlobalAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await req.json();
    await settingsService.updateAll(null, settings);

    await cache.invalidate("platform:settings*");

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
