import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 });
    }

    const organizationId = session.session.activeOrganizationId;

    if (!authorize(session, organizationId, PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body = await req.json();
    const updatedCoach = await coachesService.updateCoach(organizationId, id, body);

    await cache.invalidate(`org:${organizationId}:coaches:*`);

    return NextResponse.json(updatedCoach);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 });
    }

    const organizationId = session.session.activeOrganizationId;

    if (!authorize(session, organizationId, PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    await coachesService.deleteCoach(organizationId, id);

    await cache.invalidate(`org:${organizationId}:coaches:*`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
