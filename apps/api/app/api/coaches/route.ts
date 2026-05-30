import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache'
import { authorize } from '@/config/auth-utils'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'

import { z } from 'zod';
import { CoachesFilter } from '@workspace/shared/types';

const coachSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  roleId: z.number().optional(),
  documentId: z.string().nullable().optional().transform(v => v === "" ? null : v),
  phoneNumber: z.string().nullable().optional().transform(v => v === "" ? null : v),
  birthday: z.string().nullable().optional().transform(v => v === "" ? null : v),
  imageUrl: z.string().nullable().optional().transform(v => v === "" ? null : v),
  bio: z.string().nullable().optional().transform(v => v === "" ? null : v),
  isVisible: z.boolean().optional(),
  displayOrder: z.number().optional(),
  specialities: z.array(z.string()).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl

    const cacheKey = `org:${organizationId}:coaches:${searchParams.toString()}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const filters: CoachesFilter = {
      name: searchParams.get('name') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      isVisible: searchParams.has('isVisible')
        ? searchParams.get('isVisible') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
    }

    const result = await coachesService.getAllCoaches(organizationId, filters)

    await cache.set(cacheKey, result, 300)

    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'No autorizado o sin organización activa' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId

    if (!authorize(session, organizationId, PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.CREATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validation = coachSchema.safeParse(body)

    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Datos de formulario inválidos'
      return NextResponse.json({ error: firstError, details: validation.error.format() }, { status: 400 })
    }

    const { ...coachData } = validation.data
    const newCoach = await coachesService.createCoach(organizationId, coachData)

    await cache.invalidate(`org:${organizationId}:coaches:*`)

    return NextResponse.json(newCoach, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el entrenador'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
