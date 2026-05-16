import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { cache } from '@/lib/cache';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const cacheKey = `platform:subscriptions:${id}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return Response.json(cached)
    }

    const subscription = await platformSubscriptionsService.getSubscriptionById(Number(id));

    if (!subscription) {
      return Response.json({ error: 'Suscripción no encontrada' }, { status: 404 });
    }

    await cache.set(cacheKey, subscription, 300)

    return Response.json(subscription);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const subscriptionId = Number(id)

    // Get current subscription to know organizationId for invalidation
    const currentSub = await platformSubscriptionsService.getSubscriptionById(subscriptionId)
    const organizationId = currentSub?.organizationId

    const body = await req.json();

    if (body.action === 'cancel') {
      const result = await platformSubscriptionsService.cancelSubscription(
        subscriptionId,
        body.reason
      );

      // Invalidate cache
      await cache.invalidate('platform:subscriptions*')
      await cache.invalidate('platform:subscriptions:stats')
      await cache.invalidate('platform:plans:with-stats')
      await cache.invalidate('platform:plans:summary')
      if (organizationId) {
        await cache.invalidate(`org:${organizationId}:subscription-status`)
      }

      return Response.json(result);
    }

    if (body.action === 'extend') {
      if (!body.newEndDate) {
        return Response.json({ error: 'newEndDate es requerido para extender' }, { status: 400 });
      }
      const result = await platformSubscriptionsService.extendSubscription(
        subscriptionId,
        new Date(body.newEndDate)
      );

      // Invalidate cache
      await cache.invalidate('platform:subscriptions*')
      await cache.invalidate('platform:subscriptions:stats')
      await cache.invalidate('platform:plans:with-stats')
      await cache.invalidate('platform:plans:summary')
      if (organizationId) {
        await cache.invalidate(`org:${organizationId}:subscription-status`)
      }

      return Response.json(result);
    }

    return Response.json({ error: 'Acción desconocida. Use: cancel o extend' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const subscriptionId = Number(id)

    // Get current subscription to know organizationId for invalidation
    const currentSub = await platformSubscriptionsService.getSubscriptionById(subscriptionId)
    const organizationId = currentSub?.organizationId

    await platformSubscriptionsService.deleteSubscription(subscriptionId);

    // Invalidate cache
    await cache.invalidate('platform:subscriptions*')
    await cache.invalidate('platform:subscriptions:stats')
    await cache.invalidate('platform:plans:with-stats')
    await cache.invalidate('platform:plans:summary')
    if (organizationId) {
      await cache.invalidate(`org:${organizationId}:subscription-status`)
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}