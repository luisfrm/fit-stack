import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

interface RouteParams {
  id: string
}

export const PUT = withAuth<RouteParams>(PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    const subId = Number(params?.id)
    if (Number.isNaN(subId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const { status } = await req.json()

    if (status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Los estados "active" y "expired" son calculados automáticamente. Solo se permite el cambio manual a "cancelled".' },
        { status: 400 }
      )
    }

    const updated = await subscriptionsService.cancel(organizationId, subId)

    await cache.invalidate(`org:${organizationId}:subscriptions`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)
    await cache.invalidate(`org:${organizationId}:members:*`)

    return NextResponse.json(updated)
  }
)

export const DELETE = withAuth<RouteParams>(PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    const id = Number(params?.id)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await subscriptionsService.delete(organizationId, id)

    await cache.invalidate(`org:${organizationId}:subscriptions`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)
    await cache.invalidate(`org:${organizationId}:members:*`)

    return NextResponse.json({ success: true })
  }
)
