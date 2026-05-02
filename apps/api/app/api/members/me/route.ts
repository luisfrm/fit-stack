import { NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id || !session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId;
    const member = await membersService.getMemberByUserId(organizationId, session.user.id);

    if (!member) {
      return NextResponse.json({ error: 'Member not found', code: 'MEMBER_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json(member)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
