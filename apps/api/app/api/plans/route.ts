import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const includeStats = searchParams.get('includeStats') === 'true'

    const organizationId = session.session.activeOrganizationId;
    const plans = await plansService.getAll(organizationId, { includeStats })

    return NextResponse.json(plans)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })

    const body = await req.json()
    // Here we should validate `body` with Zod ideally
    const organizationId = session.session.activeOrganizationId;
    const { id, ...data } = body;

    const newPlan = await plansService.create(organizationId, data)
    return NextResponse.json(newPlan, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
