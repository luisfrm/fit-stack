import { NextRequest, NextResponse } from 'next/server'
import { subscriptionsService } from '@/services/subscriptions.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { status } = await req.json()
    const organizationId = session.session.activeOrganizationId

    const updated = await subscriptionsService.updatePaymentStatus(
      organizationId,
      Number(id),
      status
    )

    await cache.invalidate(`org:${organizationId}:subscriptions*`);
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`);
    await cache.invalidate(`org:${organizationId}:members:*`);

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
