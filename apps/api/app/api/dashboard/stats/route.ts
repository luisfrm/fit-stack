import { NextResponse } from 'next/server';
import { dashboardService } from "../../../../services/dashboard.service";
import { cache } from '@/lib/cache';
import { auth } from '@/config/auth';
import { headers } from 'next/headers';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared';
import { withAuth } from '@/lib/route-handler';

export const GET = withAuth(PERMISSION_MODULES.DASHBOARD, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
    const { searchParams } = new URL(req.url);
    const today = searchParams.get('today');
    if (!today) {
      return NextResponse.json({ error: 'Parameter today (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const fullOrg = await auth.api.getFullOrganization({
      headers: await headers()
    });
    
    const timezone = fullOrg?.timezone ?? 'America/Caracas';

    const cacheKey = `org:${organizationId}:dashboard:stats:${today}`;

    const cachedStats = await cache.get(cacheKey);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    const stats = await dashboardService.getDashboardSummary(organizationId, timezone);

    await cache.set(cacheKey, stats, 300);

    return NextResponse.json(stats);
  }
)
