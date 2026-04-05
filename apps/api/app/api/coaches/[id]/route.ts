import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { getSession } from '@/config/get-session'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 });
    }

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const organizationId = session.session.activeOrganizationId;
    const body = await req.json();
    const updatedCoach = await coachesService.updateCoach(organizationId, id, body);

    return NextResponse.json(updatedCoach);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 });
    }

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const organizationId = session.session.activeOrganizationId;
    await coachesService.deleteCoach(organizationId, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
