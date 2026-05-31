import { NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

interface RouteParams {
  id: string
}

export const PUT = withAuth<RouteParams>(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.UPDATE)(
  async (req, { organizationId, params }) => {
    const id = Number(params?.id)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    const body = await req.json()
    const updatedCoach = await coachesService.updateCoach(organizationId, id, body)

    await cache.invalidate(`org:${organizationId}:coaches:*`)

    return NextResponse.json(updatedCoach)
  }
)

export const DELETE = withAuth<RouteParams>(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    const id = Number(params?.id)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    await coachesService.deleteCoach(organizationId, id)

    await cache.invalidate(`org:${organizationId}:coaches:*`)

    return NextResponse.json({ success: true })
  }
)
