import { NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

export const GET = withAuth(PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const { searchParams } = req.nextUrl
    const includeStats = searchParams.get('includeStats') === 'true'

    const cacheKey = `org:${organizationId}:plans:${searchParams.toString()}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const plans = await plansService.getAll(organizationId, { includeStats })

    await cache.set(cacheKey, plans, 300)

    return NextResponse.json(plans)
  }
)

export const POST = withAuth(PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.CREATE)(
  async (req, { organizationId }) => {
    const body = await req.json()
    const { ...data } = body

    const newPlan = await plansService.create(organizationId, data)

    await cache.invalidate(`org:${organizationId}:plans:*`)

    return NextResponse.json(newPlan, { status: 201 })
  }
)
