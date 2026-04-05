import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const subId = Number(id)
    if (Number.isNaN(subId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const { status } = await req.json()
    if (!['active', 'cancelled', 'expired'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const organizationId = session.session.activeOrganizationId;
    const updated = await subscriptionsService.updateStatus(organizationId, subId, status)

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const subId = Number(id)
    if (Number.isNaN(subId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    await subscriptionsService.delete(organizationId, subId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
