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
const sessionOrg = session?.session as { activeOrganizationId?: string };
    if (!sessionOrg?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const organizationId = sessionOrg.activeOrganizationId;

    const { id: memberId } = await params
    const member = await membersService.getMemberById(organizationId, Number(memberId))
    const permissionModule = member.role === ORG_ROLES.MEMBER
      ? PERMISSION_MODULES.MEMBERS
      : PERMISSION_MODULES.STAFF

    if (!await authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await membersService.resendInvite(organizationId, Number(memberId))
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al reenviar la invitación'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
