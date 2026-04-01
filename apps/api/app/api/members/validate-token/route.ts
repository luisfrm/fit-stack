import { NextRequest, NextResponse } from 'next/server';
import { tokenService } from '@/services/token.service';
import { membersRepository } from '@/repositories/members.repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token missing' }, { status: 400 });
    }

    // Verify token
    const payload = await tokenService.verifyInviteToken(token);
    
    // Check if member exists and if they are already linked
    const member = await membersRepository.findById(payload.memberId);
    
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }
    
    if (member.user) {
      return NextResponse.json({ error: 'Esta invitación ya fue utilizada' }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
