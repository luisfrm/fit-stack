import { NextRequest, NextResponse } from 'next/server'
import { cmsBlocksService } from '@/services/cms-blocks.service'
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

    const cacheKey = `org:${organizationId}:cms:pages:${pageId}:blocks`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const blocks = await cmsBlocksService.getPageBlocks(organizationId, pageId)
    await cache.set(cacheKey, blocks, 300)

    return NextResponse.json(blocks)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.CONTENT, PERMISSION_ACTIONS.CREATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()

    const newBlock = await cmsBlocksService.createBlock(organizationId, {
      ...body,
      pageId
    })

    await cache.invalidate(`org:${organizationId}:cms:pages:${pageId}:blocks*`)

    return NextResponse.json(newBlock, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
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
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid body format' }, { status: 400 })
    }

    await cmsBlocksService.reorderBlocks(organizationId, pageId, body)

    await cache.invalidate(`org:${organizationId}:cms:pages:${pageId}:blocks*`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
