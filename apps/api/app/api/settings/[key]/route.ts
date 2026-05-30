import { NextRequest, NextResponse } from 'next/server'
import { settingsService } from '@/services/settings.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { key } = await params
    const cacheKey = `org:${organizationId}:settings:${key}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const value = await settingsService.getByKey(organizationId, key)

    if (value === undefined) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
    }

    const responseData = { key, value }
    await cache.set(cacheKey, responseData, 600)

    return NextResponse.json(responseData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.SETTINGS, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { key } = await params
    const body = await req.json()

    if (body.value === undefined) {
      return NextResponse.json({ error: 'El valor es requerido' }, { status: 400 })
    }

    await settingsService.upsert(organizationId, key, String(body.value))

    await cache.invalidate(`org:${organizationId}:settings*`)

    return NextResponse.json({ success: true, key, value: String(body.value) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
