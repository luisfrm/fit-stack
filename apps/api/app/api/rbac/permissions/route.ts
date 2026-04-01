import { NextRequest, NextResponse } from "next/server";
import { rbacService } from "@/services/rbac.service";
import { getSession } from "@/config/get-session";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = await rbacService.getAllPermissions();
    return NextResponse.json(permissions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
