import { NextRequest, NextResponse } from 'next/server'
import { cmsPagesService } from '@/services/cms-pages.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const cacheKey = `org:${organizationId}:cms:pages:${pageId}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const page = await cmsPagesService.getPageById(organizationId, pageId)
    await cache.set(cacheKey, page, 300)

    return NextResponse.json(page)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()
    const updatedPage = await cmsPagesService.updatePage(organizationId, pageId, body)

    await cache.invalidate(`org:${organizationId}:public:page:*`)
    await cache.invalidate(`org:${organizationId}:cms:pages*`)

    return NextResponse.json(updatedPage)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await cmsPagesService.deletePage(organizationId, pageId)

    await cache.invalidate(`org:${organizationId}:public:page:*`)
    await cache.invalidate(`org:${organizationId}:cms:pages*`)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
