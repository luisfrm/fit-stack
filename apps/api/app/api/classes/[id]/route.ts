import { NextRequest, NextResponse } from 'next/server'
import { classesService } from '@/services/classes.service'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cls = await classesService.getById(Number(id))
    return NextResponse.json(cls)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const updatedClass = await classesService.update(Number(id), body)
    return NextResponse.json(updatedClass)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await classesService.delete(Number(id))
    return new NextResponse(null, { status: 204 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
