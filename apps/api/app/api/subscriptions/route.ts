import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = session.session.activeOrganizationId;

    const cacheKey = `org:${organizationId}:subscriptions`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const subscriptions = await subscriptionsService.getAllVisible(organizationId)

    await cache.set(cacheKey, subscriptions, 300);

    return NextResponse.json(subscriptions)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    // Validar body...
    const organizationId = session.session.activeOrganizationId;
    const newSubscription = await subscriptionsService.create(organizationId, body)

    await cache.invalidate(`org:${organizationId}:subscriptions`);
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`);
    await cache.invalidate(`org:${organizationId}:members:*`); // members use subscription data

    return NextResponse.json(newSubscription, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
