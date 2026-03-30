import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subs = await subscriptionsService.getAllVisible()
    return NextResponse.json(subs)
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
    // Parse Date strings to actual Date objects for the backend
    const dto = {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    }

    const newSub = await subscriptionsService.create(dto)
    return NextResponse.json(newSub, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
