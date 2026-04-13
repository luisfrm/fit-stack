import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/config/get-session";
import { membersRepository } from "@/repositories/members.repository";
import { ORG_ROLES, GLOBAL_ROLES } from "@workspace/shared";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const organizationId = id;

  // 1. Get current session
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Security Check: Only Global Admins can use this endpoint
  if (session.user.role !== GLOBAL_ROLES.ADMIN) {
    return NextResponse.json({
      error: "Solo los administradores globales pueden unirse automáticamente a organizaciones"
    }, { status: 403 });
  }

  try {
    // 3. Add admin as an OWNER to the organization
    // We use OWNER role to ensure full access during the intervention
    const newMember = await membersRepository.addToOrganization(
      session.user.id,
      organizationId,
      ORG_ROLES.OWNER
    );

    return NextResponse.json({
      success: true,
      message: "Te has unido exitosamente a la organización",
      data: newMember
    });
  } catch (error: any) {
    console.error("Error auto-joining organization:", error);
    return NextResponse.json({
      error: "Error interno al procesar la unión a la organización"
    }, { status: 500 });
  }
}
