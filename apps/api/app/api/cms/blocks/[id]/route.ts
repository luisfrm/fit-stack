import { NextResponse } from 'next/server'
import { cmsBlocksService } from '@/services/cms-blocks.service'

/**
 * Handle individual Block updates and deletion.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()
    const updated = await cmsBlocksService.updateBlock(Number(id), body)
    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await cmsBlocksService.deleteBlock(Number(id))
    return new Response(null, { status: 204 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
