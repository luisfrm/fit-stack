import { NextRequest, NextResponse } from 'next/server';
import { platformSubscriptionsService } from '@/services/platform-subscriptions.service';
import { getSession } from '@/config/get-session';
import { GLOBAL_ROLES } from "@workspace/shared";
import { cache } from '@/lib/cache';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    // Admin only
    if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
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
      paymentMethod: body.payment?.paymentMethod || 'manual_admin',
      currency: body.payment?.currencyPaid || 'USD',
      amount: body.payment?.amountPaid ? String(body.payment.amountPaid / 100) : undefined,
      paymentStatus: body.payment?.status || 'processing',
      exchangeRateApplied: body.payment?.exchangeRateApplied,
      paymentMethodDetails: body.payment?.paymentMethodDetails,
      paymentDate: body.payment?.paymentDate ? new Date(body.payment.paymentDate) : undefined,
    });

    await cache.invalidate('platform:subscriptions*')
    await cache.invalidate('platform:subscriptions:stats')
    await cache.invalidate('platform:organizations:' + id)
    await cache.invalidate('org:' + id + ':subscription-status')
    await cache.invalidate('platform:plans:with-stats')
    await cache.invalidate('platform:plans:summary')

    return NextResponse.json(subscription, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
