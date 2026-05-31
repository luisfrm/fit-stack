import { NextRequest, NextResponse } from 'next/server'
import { classesService } from '@/services/classes.service'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { cache } from '@/lib/cache'
import { withAuth } from '@/lib/route-handler'

interface RouteParams {
  id: string
}

export const GET = withAuth<RouteParams>(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId, params }) => {
    const cacheKey = `org:${organizationId}:classes:${params?.id}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const cls = await classesService.getById(organizationId, Number(params?.id))
    await cache.set(cacheKey, cls, 300)

    return NextResponse.json(cls)
  }
)

export const PUT = withAuth<RouteParams>(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)(
  async (req, { organizationId, params }) => {
    const body = await req.json()
    const updatedClass = await classesService.update(organizationId, Number(params?.id), body)

    await cache.invalidate(`org:${organizationId}:classes:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json(updatedClass)
  }
)

export const DELETE = withAuth<RouteParams>(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    await classesService.delete(organizationId, Number(params?.id))

    await cache.invalidate(`org:${organizationId}:classes:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return new NextResponse(null, { status: 204 })
  }
)
