import { NextRequest, NextResponse } from 'next/server'
import { cmsPagesService } from '@/services/cms-pages.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET() {
  try {
    const session = await getSession()
    const sessionOrg = session?.session as { activeOrganizationId?: string };
    if (!sessionOrg?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = sessionOrg.activeOrganizationId;

    if (!await authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cacheKey = `org:${organizationId}:cms:pages`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const pages = await cmsPagesService.getAllPages(organizationId)
    await cache.set(cacheKey, pages, 300)

    return NextResponse.json(pages)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const sessionOrg = session?.session as { activeOrganizationId?: string };
    if (!sessionOrg?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = sessionOrg.activeOrganizationId;

    if (!await authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.CREATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { ...data } = body

    const newPage = await cmsPagesService.createPage(organizationId, data)

    await cache.invalidate(`org:${organizationId}:cms:pages*`)

    return NextResponse.json(newPage, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
