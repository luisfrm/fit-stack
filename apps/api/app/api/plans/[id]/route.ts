import { NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

interface RouteParams {
  id: string
}

export const PUT = withAuth<RouteParams>(PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.UPDATE)(
  async (req, { organizationId, params }) => {
    const planId = Number(params?.id)
    if (Number.isNaN(planId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()
    const updatedPlan = await plansService.update(organizationId, planId, body)

    await cache.invalidate(`org:${organizationId}:plans:*`)

    return NextResponse.json(updatedPlan)
  }
)

export const DELETE = withAuth<RouteParams>(PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    const planId = Number(params?.id)
    if (Number.isNaN(planId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await plansService.delete(organizationId, planId)

    await cache.invalidate(`org:${organizationId}:plans:*`)

    return NextResponse.json({ success: true })
  }
)
