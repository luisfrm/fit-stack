import { NextRequest, NextResponse } from 'next/server'
import { cmsPagesService } from '@/services/cms-pages.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    const page = await cmsPagesService.getPageById(organizationId, pageId)
    return NextResponse.json(page)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()
    const organizationId = session.session.activeOrganizationId;
    const updatedPage = await cmsPagesService.updatePage(organizationId, pageId, body)

    await cache.invalidate(`org:${organizationId}:public:page:*`);

    return NextResponse.json(updatedPage)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const pageId = Number(id)
    if (Number.isNaN(pageId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    await cmsPagesService.deletePage(organizationId, pageId)

    await cache.invalidate(`org:${organizationId}:public:page:*`);

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
