import { NextRequest, NextResponse } from 'next/server';
import { organizationsService } from '@/services/organizations.service';
import { getSession } from '@/config/get-session';
import { ROLES } from "@workspace/shared/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    
    // Security: Only SaaS Admin can see all organizations
    if (session?.user?.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const filters = {
      query: searchParams.get('query') ?? undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
    };

    const result = await organizationsService.getAllOrganizations(filters);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    
    // Security: Only SaaS Admin can create organizations
    if (session?.user?.role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ error: 'El nombre de la organización es requerido' }, { status: 400 });
    }

    const newOrg = await organizationsService.createOrganization(body);
    return NextResponse.json(newOrg, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
