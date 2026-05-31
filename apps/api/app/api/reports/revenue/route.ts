import { NextResponse } from 'next/server'
import { reportsService } from '@/services/reports.service'
import { cache } from '@/lib/cache'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { IOrganization, PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

export const GET = withAuth(PERMISSION_MODULES.REPORTS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })
    
    const timezone = (fullOrg as IOrganization)?.timezone || 'America/Caracas'

    const cacheKey = `org:${organizationId}:reports:revenue:12m`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const data = await reportsService.getMonthlyRevenue(organizationId, timezone, 12)

    await cache.set(cacheKey, data, 60 * 60)

    return NextResponse.json(data)
  }
)
