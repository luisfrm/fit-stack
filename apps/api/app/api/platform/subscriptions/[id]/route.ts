import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';

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
    const subscription = await platformSubscriptionsService.getSubscriptionById(Number(id));

    if (!subscription) {
      return Response.json({ error: 'Suscripción no encontrada' }, { status: 404 });
    }

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
    const body = await req.json();

    if (body.action === 'cancel') {
      const result = await platformSubscriptionsService.cancelSubscription(
        Number(id),
        body.reason
      );
      return Response.json(result);
    }

    if (body.action === 'extend') {
      if (!body.newEndDate) {
        return Response.json({ error: 'newEndDate es requerido para extender' }, { status: 400 });
      }
      const result = await platformSubscriptionsService.extendSubscription(
        Number(id),
        new Date(body.newEndDate)
      );
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
    await platformSubscriptionsService.deleteSubscription(Number(id));
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}