import { NextRequest, NextResponse } from 'next/server'
import { cmsBlocksService } from '@/services/cms-blocks.service'
import { getSession } from '@/config/get-session'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const blockId = Number(id)
    if (Number.isNaN(blockId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()
    const organizationId = session.session.activeOrganizationId;
    const updatedBlock = await cmsBlocksService.updateBlock(organizationId, blockId, body)

    return NextResponse.json(updatedBlock)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const blockId = Number(id)
    if (isNaN(blockId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    await cmsBlocksService.deleteBlock(organizationId, blockId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
