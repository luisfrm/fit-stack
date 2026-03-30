import { NextResponse } from 'next/server'
import { cmsBlocksService } from '@/services/cms-blocks.service'

/**
 * Handle blocks for a specific Page.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const blocks = await cmsBlocksService.getPageBlocks(Number(id))
    return NextResponse.json(blocks)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()
    const block = await cmsBlocksService.createBlock({
      ...body,
      pageId: Number(id)
    })
    return NextResponse.json(block, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

/**
 * Reordenamiento masivo (Drag & Drop).
 * Espera un body { orders: { id: number, displayOrder: number }[] }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json()
    if (!body.orders || !Array.isArray(body.orders)) {
      throw new Error('Formato de órdenes inválido')
    }

    await cmsBlocksService.reorderBlocks(Number(id), body.orders)
    return NextResponse.json({ message: 'Orden actualizado correctamente' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
