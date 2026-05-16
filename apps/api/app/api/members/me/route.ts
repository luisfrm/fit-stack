import { NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id || !session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId;
    const userId = session.user.id;
    const cacheKey = `org:${organizationId}:members:me:${userId}`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const member = await membersService.getMemberByUserId(organizationId, userId);

    if (!member) {
      return NextResponse.json({ error: 'Member not found', code: 'MEMBER_NOT_FOUND' }, { status: 404 })
    }

    await cache.set(cacheKey, member, 300)

    return NextResponse.json(member)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
