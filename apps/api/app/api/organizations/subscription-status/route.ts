import { NextRequest } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { cache } from '@/lib/cache';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userRole = session.user.role;
  const activeOrganizationId = session.session?.activeOrganizationId;

  if (!activeOrganizationId) {
    if (userRole === GLOBAL_ROLES.ADMIN) {
      return Response.json({ status: 'active' });
    }
    return Response.json({ error: 'No active organization' }, { status: 400 });
  }

  try {
    const cacheKey = `org:${activeOrganizationId}:subscription-status`;
    const cached = await cache.get<{ status: string }>(cacheKey);
    if (cached) {
      return Response.json(cached);
    }

    const status = await platformSubscriptionsService.getOrganizationStatus(activeOrganizationId);
    const data = { status };
    await cache.set(cacheKey, data, 60);

    return Response.json(data);
  } catch (error: any) {
    console.error('[GET /api/organizations/subscription-status] Error:', error);
    return Response.json(
      { error: 'SUBSCRIPTION_STATUS_FAILED', message: error.message },
      { status: 500 }
    );
  }
}