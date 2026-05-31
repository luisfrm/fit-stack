import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
const sessionOrg = session?.session as { activeOrganizationId?: string };
    if (!sessionOrg?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
const organizationId = sessionOrg.activeOrganizationId;

    if (!await authorize(session, organizationId, PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: paymentId } = await params;
    const { status } = await req.json();

    const updated = await subscriptionsService.updatePaymentStatus(
      organizationId,
      Number(paymentId),
      status
    )

    await cache.invalidate(`org:${organizationId}:subscriptions*`);
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`);
    await cache.invalidate(`org:${organizationId}:members:*`);

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
