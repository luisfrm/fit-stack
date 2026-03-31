import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from "../../../../services/dashboard.service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const today = searchParams.get('today');
    
    if (!today) {
      return NextResponse.json({ error: 'Parameter today (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const stats = await dashboardService.getDashboardStats(today);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[DASHBOARD_STATS_GET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
