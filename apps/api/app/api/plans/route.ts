import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.CREATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { ...data } = body

    const newPlan = await plansService.create(organizationId, data)

    await cache.invalidate(`org:${organizationId}:plans:*`)

    return NextResponse.json(newPlan, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
