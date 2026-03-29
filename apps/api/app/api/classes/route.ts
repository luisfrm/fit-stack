import { NextRequest, NextResponse } from 'next/server'
import { classesService } from '@/services/classes.service'

export async function GET() {
  try {
    const classes = await classesService.getAll()
    return NextResponse.json(classes)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const newClass = await classesService.create(body)
    return NextResponse.json(newClass, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
