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
    const organizationId = session.session.activeOrganizationId;

    if (status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Los estados "active" y "expired" son calculados automáticamente. Solo se permite el cambio manual a "cancelled".' }, 
        { status: 400 }
      )
    }

    const updated = await subscriptionsService.cancel(organizationId, subId)

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
