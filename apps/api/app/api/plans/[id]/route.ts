import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const planId = Number(id)
    if (Number.isNaN(planId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    const body = await req.json()
    const updatedPlan = await plansService.update(organizationId, planId, body)

    return NextResponse.json(updatedPlan)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params;
    const planId = Number(id)
    if (Number.isNaN(planId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const organizationId = session.session.activeOrganizationId;
    await plansService.delete(organizationId, planId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
