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
    const cacheKey = 'platform:plans:summary'
    const cached = await cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const summary = await platformPlansService.getSummary();
    await cache.set(cacheKey, summary, 600)

    return Response.json(summary);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}