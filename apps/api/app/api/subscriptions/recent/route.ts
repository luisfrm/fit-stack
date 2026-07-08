import { NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'

export const GET = withAuth(PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const { searchParams } = req.nextUrl
    const limit = Number(searchParams.get('limit')) || 5

    const cacheKey = `org:${organizationId}:subscriptions:recent:${limit}`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const records = await subscriptionsService.getRecent(organizationId, limit)

    await cache.set(cacheKey, records, 300);

    return NextResponse.json(records)
  }
)
