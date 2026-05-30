import { NextResponse } from 'next/server'
import { reportsService } from '@/services/reports.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { authorize } from '@/config/auth-utils'
import { IOrganization, PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.REPORTS, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch full organization to get timezone
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

    // Cache this for a long time as past months don't change
    await cache.set(cacheKey, data, 60 * 60) // 1 hour

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    console.error('[REPORTS_REVENUE_ERROR]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
