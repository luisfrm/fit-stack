import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const plans = await plansService.getAll()
    return NextResponse.json(plans)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // In production, we'd add role validation for admin/manager here
    const body = await req.json()
    const newPlan = await plansService.create(body)
    return NextResponse.json(newPlan, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
