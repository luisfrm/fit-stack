import { NextResponse } from 'next/server'
import { financeService } from '@/services/finance.service'
import { getSession } from '@/config/get-session'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

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

    const cacheKey = `org:${organizationId}:payments:analytics`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // Fetch full organization to get timezone from metadata/additional fields
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })

    const timezone = fullOrg?.timezone ?? 'America/Caracas'
    const stats = await financeService.getDashboardAnalytics(organizationId, timezone)

    await cache.set(cacheKey, stats, 300)

    return NextResponse.json(stats)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    console.error('[PAYMENTS_ANALYTICS_ERROR]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
