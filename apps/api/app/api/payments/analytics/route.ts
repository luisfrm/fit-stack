import { NextResponse } from 'next/server'
import { financeService } from '@/services/finance.service'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

export const GET = withAuth(PERMISSION_MODULES.REPORTS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const cacheKey = `org:${organizationId}:payments:analytics`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })

    const timezone = fullOrg?.timezone ?? 'America/Caracas'
    const stats = await financeService.getDashboardAnalytics(organizationId, timezone)

    await cache.set(cacheKey, stats, 300)

    return NextResponse.json(stats)
  }
)
