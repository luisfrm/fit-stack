import { NextRequest, NextResponse } from 'next/server'
import { plansService } from '@/services/plans.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const includeStats = searchParams.get('includeStats') === 'true'

    const organizationId = session.session.activeOrganizationId;
    
    const cacheKey = `org:${organizationId}:plans:${searchParams.toString()}`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const plans = await plansService.getAll(organizationId, { includeStats })

    await cache.set(cacheKey, plans, 300); // Cache for 5 minutes

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
    
    await cache.invalidate(`org:${organizationId}:plans:*`);

    return NextResponse.json(newPlan, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
