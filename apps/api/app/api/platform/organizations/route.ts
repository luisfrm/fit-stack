import { NextRequest, NextResponse } from 'next/server';
import { organizationsService } from '@/services/organizations.service';
import { getSession } from '@/config/get-session';
import { GLOBAL_ROLES } from "@workspace/shared";
import { cache } from '@/lib/cache';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    
    // Security: Only SaaS Admin (Role 1 or specific ADMIN string)
    // We assume Role 1 is Super Admin based on project patterns
    if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const cacheKey = `platform:organizations:${searchParams.toString()}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const filters = {
      query: searchParams.get('query') ?? undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      includeMemberCount: searchParams.get('includeMemberCount') === 'true',
    };

    const result = await organizationsService.getAllOrganizations(filters);
    await cache.set(cacheKey, result, 300)

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    
    if (session?.user?.role !== GLOBAL_ROLES.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const newOrg = await organizationsService.createOrganization(body);

    await cache.invalidate('platform:organizations*')

    return NextResponse.json(newOrg, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
