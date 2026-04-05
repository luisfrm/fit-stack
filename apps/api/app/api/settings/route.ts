import { NextResponse, NextRequest } from "next/server";
import { getSession } from "@/config/get-session";
import { settingsService } from "@/services/settings.service";
import { ROLES } from "@workspace/shared/types";

// Reserved ID for Platform-wide settings
const PLATFORM_ID = "PLATFORM_GLOBAL";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    // 1. Security Check: Only Admin or someone with an active session in an organization
    if (session?.user.role !== ROLES.ADMIN && !session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resource Identification
    // If it's a SaaS Admin without an active gym, we use the Platform ID
    const organizationId = session?.session?.activeOrganizationId || (session?.user.role === ROLES.ADMIN ? PLATFORM_ID : null);
    
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID is required.' }, { status: 400 });
    }

    const settings = await settingsService.getAll(organizationId);
    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    
    // 1. Security Check
    if (session?.user.role !== ROLES.ADMIN && !session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resource Identification
    const organizationId = session?.session?.activeOrganizationId || (session?.user.role === ROLES.ADMIN ? PLATFORM_ID : null);
    
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID is required.' }, { status: 400 });
    }

    const settings = await req.json();
    await settingsService.updateAll(organizationId, settings);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
