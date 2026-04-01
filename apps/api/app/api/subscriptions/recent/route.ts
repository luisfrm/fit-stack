import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '5', 10)
    const recent = await subscriptionsService.getRecent(limit)
    return NextResponse.json(recent)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
