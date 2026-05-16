import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformPlansService } from '@/services/platform-plans.service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const plans = await platformPlansService.getAllPlansWithStats();
    return Response.json(plans);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}