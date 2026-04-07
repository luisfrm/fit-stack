import { NextRequest } from 'next/server';
import { auth } from '@/config/auth';
import { GLOBAL_ROLES } from '@workspace/shared';
import { platformPlansService } from '@/services/platform-plans.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session || session.user.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updatedPlan = await platformPlansService.updatePlan(Number(id), body);
    return Response.json(updatedPlan);
  } catch (error: any) {
    const status = error.message.includes('No encontrado') ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session || session.user.role !== GLOBAL_ROLES.ADMIN) {
    return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await platformPlansService.deletePlan(Number(id));
    return new Response(null, { status: 204 });
  } catch (error: any) {
    const status = error.message.includes('No encontrado') ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
}
