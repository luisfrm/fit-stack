import { NextRequest, NextResponse } from "next/server";
import { rbacService } from "@/services/rbac.service";
import { getSession } from "@/config/get-session";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roles = await rbacService.getAllRoles();
    return NextResponse.json(roles);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify if session.user has 'settings.roles:manage' permission
    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes("settings.roles:manage")) {
      return NextResponse.json(
        { error: "Forbidden: No tienes permiso para gestionar roles y permisos." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, name, description, permissionIds } = body;

    if (!name) {
      return NextResponse.json({ error: "Nombre del rol es requerido" }, { status: 400 });
    }

    const role = await rbacService.upsertRole(id, name, description, permissionIds || []);
    return NextResponse.json(role);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
