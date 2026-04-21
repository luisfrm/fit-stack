import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const limit = Number(searchParams.get('limit')) || 5

    const organizationId = session.session.activeOrganizationId;
    
    const cacheKey = `org:${organizationId}:subscriptions:recent:${limit}`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const records = await subscriptionsService.getRecent(organizationId, limit)

    await cache.set(cacheKey, records, 300);

    return NextResponse.json(records)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
