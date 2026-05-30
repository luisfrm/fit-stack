import { NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { IOrganization, PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const cacheKey = `org:${organizationId}:plans:summary`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // Fetch full organization to get timezone
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })

    const timezone = (fullOrg as IOrganization)?.timezone || 'America/Caracas'

    const summary = await plansService.getSummary(organizationId, timezone)
    await cache.set(cacheKey, summary, 300)

    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
