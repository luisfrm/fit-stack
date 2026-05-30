import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { authorize } from '@/config/auth-utils'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const subId = Number(id)
    if (Number.isNaN(subId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId

    const { status } = await req.json()

    if (status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Los estados "active" y "expired" son calculados automáticamente. Solo se permite el cambio manual a "cancelled".' },
        { status: 400 }
      )
    }

    if (!authorize(session, organizationId, PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await subscriptionsService.cancel(organizationId, subId)

    await cache.invalidate(`org:${organizationId}:subscriptions`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)
    await cache.invalidate(`org:${organizationId}:members:*`)

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const subId = Number(id)
    if (Number.isNaN(subId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await subscriptionsService.delete(organizationId, subId)

    await cache.invalidate(`org:${organizationId}:subscriptions`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)
    await cache.invalidate(`org:${organizationId}:members:*`)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
