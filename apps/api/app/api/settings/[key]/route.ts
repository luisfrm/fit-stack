import { NextRequest, NextResponse } from 'next/server'
import { settingsService } from '@/services/settings.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key } = await params;
    const organizationId = session.session.activeOrganizationId;

    const cacheKey = `org:${organizationId}:settings:${key}`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const value = await settingsService.getByKey(organizationId, key)

    if (value === undefined) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
    }

    const responseData = { key, value };
    await cache.set(cacheKey, responseData, 600); // 10 mins

    return NextResponse.json(responseData)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key } = await params;
    const body = await req.json()

    if (body.value === undefined) {
      return NextResponse.json({ error: 'El valor es requerido' }, { status: 400 })
    }

    const organizationId = session.session.activeOrganizationId;
    await settingsService.upsert(organizationId, key, String(body.value))

    await cache.invalidate(`org:${organizationId}:settings*`);

    return NextResponse.json({ success: true, key, value: String(body.value) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
