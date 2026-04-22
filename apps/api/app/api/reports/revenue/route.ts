import { NextRequest, NextResponse } from 'next/server'
import { reportsService } from '@/services/reports.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId

    const cacheKey = `org:${organizationId}:reports:revenue:12m`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const data = await reportsService.getMonthlyRevenue(organizationId, 12)

    // Cache this for a long time as past months don't change
    await cache.set(cacheKey, data, 60 * 60) // 1 hour

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[REPORTS_REVENUE_ERROR]', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
