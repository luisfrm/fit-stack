import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { id } = await params
    const memberId = Number(id)

    if (Number.isNaN(memberId)) {
      return NextResponse.json({ error: 'ID de miembro inválido' }, { status: 400 })
    }

    const organizationId = session.session.activeOrganizationId;
    const result = await membersService.resendInvite(organizationId, memberId)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error al reenviar la invitación' },
      { status: 400 }
    )
  }
}
