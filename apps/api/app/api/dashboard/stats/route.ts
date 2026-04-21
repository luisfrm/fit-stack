import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from "../../../../services/dashboard.service";
import { getSession } from '@/config/get-session';
import { cache } from '@/lib/cache';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const today = searchParams.get('today');

    if (!today) {
      return NextResponse.json({ error: 'Parameter today (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const organizationId = session.session.activeOrganizationId;
    const cacheKey = `org:${organizationId}:dashboard:stats:${today}`;

    // Try to get from cache
    const cachedStats = await cache.get(cacheKey);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    const stats = await dashboardService.getDashboardSummary(organizationId);

    // Cache for 5 minutes (300 seconds)
    await cache.set(cacheKey, stats, 300);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[DASHBOARD_STATS_GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
