import { NextResponse } from 'next/server'
import { cmsPagesService } from '@/services/cms-pages.service'

export async function GET() {
  try {
    const pages = await cmsPagesService.getAllPages()
    return NextResponse.json(pages)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const page = await cmsPagesService.createPage(body)
    return NextResponse.json(page, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
