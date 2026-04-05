import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId;
    const summary = await plansService.getSummary(organizationId)
    return NextResponse.json(summary)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
