import { NextRequest, NextResponse } from 'next/server';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { getSession } from '@/config/get-session';
import { ROLES } from "@workspace/shared/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    
    // Admin only
    if (session?.user?.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();

    // Requerir datos mínimos
    if (!body.planId || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'PlanId, startDate y endDate son requeridos' }, { status: 400 });
    }

    const subscription = await platformSubscriptionsService.createManualSubscription({
      organizationId: id,
      planId: Number(body.planId),
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      isTrial: !!body.isTrial,
      priceOverride: body.priceOverride,
      paymentMethod: body.paymentMethod || 'manual_admin',
      currency: body.currency || 'USD',
    });

    return NextResponse.json(subscription, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
