import { NextRequest, NextResponse } from 'next/server';
import { tokenService } from '@/services/token.service';
import { membersRepository } from '@/repositories/members.repository';
import { getSession } from '@/config/get-session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !session.session.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Token es requerido' }, { status: 400 });
    }

    const payload = await tokenService.verifyInviteToken(token);
    const organizationId = session.session.activeOrganizationId;
    
    if (payload.organizationId !== organizationId) {
      return NextResponse.json({ error: 'El token pertenece a otra organización' }, { status: 403 });
    }
    
    const member = await membersRepository.findById(organizationId, payload.memberId);
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }
    
    if (member.userId) {
      return NextResponse.json({ error: 'Este miembro ya está vinculado' }, { status: 400 });
    }

    // 1. Vinculamos el user.id dentro del registro gymMembers (el schema.ts actual lo soporta)
    await membersRepository.update(organizationId, member.id, { userId: session.user.id });

    // 2. Agregamos el usuario a la organización en Better Auth con el rol que ya tiene definido el miembro
    await membersRepository.addToOrganization(session.user.id, organizationId, member.role);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
