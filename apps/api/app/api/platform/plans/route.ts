import { NextRequest } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformPlansService } from '@/services/platform-plans.service';
import { cache } from '@/lib/cache';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if ((session?.user as { role?: string }).role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const cacheKey = 'platform:plans'
    const cached = await cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const plans = await platformPlansService.getAllPlans();
    await cache.set(cacheKey, plans, 600)

    return Response.json(plans);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if ((session?.user as { role?: string }).role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const newPlan = await platformPlansService.createPlan(body);

    await cache.invalidate('platform:plans*')

    return Response.json(newPlan, { status: 201 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
