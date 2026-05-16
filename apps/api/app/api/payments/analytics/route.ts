import { NextRequest, NextResponse } from 'next/server'
import { financeService } from '@/services/finance.service'
import { getSession } from '@/config/get-session'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const cacheKey = `org:${organizationId}:payments:analytics`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // Fetch full organization to get timezone from metadata/additional fields
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })

    const timezone = (fullOrg as any)?.organization?.timezone || 'America/Caracas'
    const stats = await financeService.getDashboardAnalytics(organizationId, timezone)

    await cache.set(cacheKey, stats, 300)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('[PAYMENTS_ANALYTICS_ERROR]', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
