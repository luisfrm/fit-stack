import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId;
    const cacheKey = `org:${organizationId}:plans:summary`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // Fetch full organization to get timezone
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })

    const timezone = (fullOrg as any)?.organization?.timezone || 'America/Caracas'

    const summary = await plansService.getSummary(organizationId, timezone)
    await cache.set(cacheKey, summary, 300)

    return NextResponse.json(summary)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
