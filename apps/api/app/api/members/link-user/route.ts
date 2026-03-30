import { NextRequest, NextResponse } from 'next/server';
import { tokenService } from '@/services/token.service';
import { membersRepository } from '@/repositories/members.repository';
import { getSession } from '@/config/get-session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Token es requerido' }, { status: 400 });
    }

    const payload = await tokenService.verifyInviteToken(token);
    
    const member = await membersRepository.findById(payload.memberId);
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }
    
    if (member.userId) {
      return NextResponse.json({ error: 'Este miembro ya está vinculado' }, { status: 400 });
    }

    // Vinculamos el userID provisto por el session
    await membersRepository.update(member.id, { userId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
