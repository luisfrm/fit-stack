import { NextRequest, NextResponse } from 'next/server';
import { membersService } from '@/services/members.service';
import { getSession } from '@/config/get-session';
import { GLOBAL_ROLES } from "@workspace/shared";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    
    // Security: Only SaaS Admin can provision owners directly via this route
    if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: organizationId } = await params;
    const body = await req.json();
    const { sendInvite, ...memberData } = body;

    if (!memberData.firstName || !memberData.lastName || !memberData.email) {
      return NextResponse.json({ error: 'Nombre, apellido y correo son requeridos' }, { status: 400 });
    }

    const newMember = await membersService.createMember(organizationId, memberData, sendInvite === true);

    return NextResponse.json(newMember, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
