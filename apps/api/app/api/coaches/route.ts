import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl

    const filters = {
      name: searchParams.get('name') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      isVisible: searchParams.has('isVisible')
        ? searchParams.get('isVisible') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
    }

    const result = await coachesService.getAllCoaches(filters)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    if (!body.name || !body.role) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 })
    }

    const newCoach = await coachesService.createCoach(body)
    return NextResponse.json(newCoach, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
