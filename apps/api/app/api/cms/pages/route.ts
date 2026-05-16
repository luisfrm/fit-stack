import { NextRequest, NextResponse } from 'next/server'
import { cmsPagesService } from '@/services/cms-pages.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId;
    const cacheKey = `org:${organizationId}:cms:pages`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const pages = await cmsPagesService.getAllPages(organizationId)
    await cache.set(cacheKey, pages, 300)

    return NextResponse.json(pages)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const organizationId = session.session.activeOrganizationId;
    const { id, ...data } = body;

    const newPage = await cmsPagesService.createPage(organizationId, data)

    await cache.invalidate(`org:${organizationId}:cms:pages*`)

    return NextResponse.json(newPage, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
