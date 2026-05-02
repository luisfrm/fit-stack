import { NextRequest, NextResponse } from 'next/server'
import { financeService } from '@/services/finance.service'
import { getSession } from '@/config/get-session'
import { auth } from '@/config/auth'
import { headers } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    
    // Fetch full organization to get timezone from metadata/additional fields
    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    })
    
    const timezone = (fullOrg as any)?.organization?.timezone || 'America/Caracas'
    const stats = await financeService.getDashboardAnalytics(organizationId, timezone)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('[PAYMENTS_ANALYTICS_ERROR]', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
