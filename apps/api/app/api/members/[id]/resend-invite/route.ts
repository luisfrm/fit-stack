import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'
import { authorize } from '@/config/auth-utils'
import { ORG_ROLES, PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

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

    const organizationId = session.session.activeOrganizationId

    const member = await membersService.getMemberById(organizationId, memberId)
    const permissionModule = member.role === ORG_ROLES.MEMBER
      ? PERMISSION_MODULES.MEMBERS
      : PERMISSION_MODULES.STAFF

    if (!authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await membersService.resendInvite(organizationId, memberId)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al reenviar la invitación'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
