import { NextRequest, NextResponse } from 'next/server'
import { classesService } from '@/services/classes.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 });
    }

    const { id } = await params
    const cls = await classesService.getById(organizationId, Number(id))
    return NextResponse.json(cls)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 });
    }

    const { id } = await params
    const body = await req.json()
    const updatedClass = await classesService.update(organizationId, Number(id), body)

    // Invalidate cache
    await cache.invalidate(`org:${organizationId}:classes:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json(updatedClass)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 });
    }

    const { id } = await params
    await classesService.delete(organizationId, Number(id))

    // Invalidate cache
    await cache.invalidate(`org:${organizationId}:classes:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return new NextResponse(null, { status: 204 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
