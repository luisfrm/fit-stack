import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const stats = await platformSubscriptionsService.getStats();
    return Response.json(stats);
  } catch (error: any) {
    console.error('[GET /platform/subscriptions/stats] Error:', error);
    return Response.json(
      { error: 'STATS_QUERY_FAILED', message: error.message },
      { status: 500 }
    );
  }
}