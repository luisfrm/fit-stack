import { NextRequest, NextResponse } from 'next/server';
import { accessControlRepository } from '@/repositories/access-control.repository';

/**
 * GET /api/access-control/sync-tasks?organizationId=...
 * Pulls pending synchronization tasks for the local Bridge app.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const organizationId = searchParams.get('organizationId');
    const apiKey = req.headers.get('x-api-key');

    // Simple API Key validation (In a real scenario, this would be per-organization)
    if (!apiKey || apiKey !== process.env.ACCESS_CONTROL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Missing organizationId' }, { status: 400 });
    }

    const tasks = await accessControlRepository.getPendingSyncTasks(organizationId);
    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
