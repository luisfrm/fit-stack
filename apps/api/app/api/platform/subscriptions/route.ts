import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { platformPlansService } from '@/services/platform-plans.service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') || undefined;
    const planId = searchParams.get('planId') ? parseInt(searchParams.get('planId')!, 10) : undefined;
    const organizationId = searchParams.get('organizationId') || undefined;
    const isTrialParam = searchParams.get('isTrial');

    const filters: any = { page, limit };
    if (status && status !== 'all') filters.status = status;
    if (planId) filters.planId = planId;
    if (organizationId) filters.organizationId = organizationId;
    if (isTrialParam === 'true') filters.isTrial = true;
    if (isTrialParam === 'false') filters.isTrial = false;

    const result = await platformSubscriptionsService.getAllSubscriptions(filters);
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.organizationId || !body.planId || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'organizationId, planId, startDate y endDate son requeridos' }, { status: 400 });
    }

    const subscription = await platformSubscriptionsService.createManualSubscription({
      organizationId: body.organizationId,
      planId: Number(body.planId),
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      isTrial: !!body.isTrial,
      priceOverride: body.priceOverride,
      paymentMethod: body.paymentMethod || 'manual_admin',
      currency: body.currency || 'USD',
    });

    return Response.json(subscription, { status: 201 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}