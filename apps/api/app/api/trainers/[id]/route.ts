import { NextResponse } from 'next/server'
import { trainersService } from '@/services/trainers.service'
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
    const updatedTrainer = await trainersService.updateTrainer(organizationId, id, body)

    await cache.invalidate(`org:${organizationId}:trainers:*`)

    return NextResponse.json(updatedTrainer)
  }
)

export const DELETE = withAuth<RouteParams>(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.DELETE)(
  async (req, { organizationId, params }) => {
    const id = Number(params?.id)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    await trainersService.deleteTrainer(organizationId, id)

    await cache.invalidate(`org:${organizationId}:trainers:*`)

    return NextResponse.json({ success: true })
  }
)