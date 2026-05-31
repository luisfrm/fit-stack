import { NextRequest } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { cache } from '@/lib/cache';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if ((session?.user as { role?: string }).role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const cacheKey = 'platform:subscriptions:stats'
    const cached = await cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const stats = await platformSubscriptionsService.getStats();
    await cache.set(cacheKey, stats, 300)

    return Response.json(stats);
  } catch (error: any) {
    console.error('[GET /platform/subscriptions/stats] Error:', error);
    return Response.json(
      { error: 'STATS_QUERY_FAILED', message: error.message },
      { status: 500 }
    );
  }
}