import { NextRequest, NextResponse } from "next/server";
import { rbacService } from "@/services/rbac.service";
import { getSession } from "@/config/get-session";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    
    // For the very first seed, we might want to allow it if no users exist or via a secret header
    // However, usually it's better to protect it.
    // If there's no session, we'll allow it ONLY IF the database is empty (no roles)
    const existingRoles = await rbacService.getAllRoles();
    
    if (existingRoles.length > 0 && !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await rbacService.seedBasicRBAC();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
