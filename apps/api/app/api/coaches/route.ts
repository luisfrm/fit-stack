import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'
import { z } from 'zod'
import { CoachesFilter } from '@workspace/shared/types'

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

export const GET = withAuth(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.READ)(
  async (req, { organizationId }) => {
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
  }
)

export const POST = withAuth(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.CREATE)(
  async (req, { organizationId }) => {
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
  }
)
