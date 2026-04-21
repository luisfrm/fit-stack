import { NextRequest, NextResponse } from 'next/server'
import { financeService } from '@/services/finance.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const stats = await financeService.getDashboardAnalytics(organizationId)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('[PAYMENTS_ANALYTICS_ERROR]', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
