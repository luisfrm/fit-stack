import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { id: rawId } = await params
    const id = Number(rawId)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    const organizationId = session.session.activeOrganizationId;

    const body = await req.json()
    const updatedMember = await membersService.updateMember(organizationId, id, body)

    await cache.invalidate(`org:${organizationId}:members:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json(updatedMember)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { id: rawId } = await params
    const id = Number(rawId)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    const organizationId = session.session.activeOrganizationId;

    await membersService.deleteMember(organizationId, id)

    await cache.invalidate(`org:${organizationId}:members:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
