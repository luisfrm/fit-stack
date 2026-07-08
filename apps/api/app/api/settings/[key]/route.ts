import { NextResponse } from 'next/server'
import { settingsService } from '@/services/settings.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

interface RouteParams {
  key: string
}

export const GET = withAuth<RouteParams>(PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId, params }) => {
    const cacheKey = `org:${organizationId}:settings:${params?.key}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const value = await settingsService.getByKey(organizationId, params?.key!)

    if (value === undefined) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
    }

    const responseData = { key: params?.key, value }
    await cache.set(cacheKey, responseData, 600)

    return NextResponse.json(responseData)
  }
)

export const PUT = withAuth<RouteParams>(PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.UPDATE)(
  async (req, { organizationId, params }) => {
    const body = await req.json()

    if (body.value === undefined) {
      return NextResponse.json({ error: 'El valor es requerido' }, { status: 400 })
    }

    await settingsService.upsert(organizationId, params?.key!, String(body.value))

    await cache.invalidate(`org:${organizationId}:settings*`)

    return NextResponse.json({ success: true, key: params?.key, value: String(body.value) })
  }
)
