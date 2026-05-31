import { NextResponse } from 'next/server'
import { trainersService } from '@/services/trainers.service'
import { cache } from '@/lib/cache'
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@workspace/shared'
import { withAuth } from '@/lib/route-handler'
import { z } from 'zod'
import { TrainersFilter } from '@workspace/shared/types'

const trainerSchema = z.object({
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

    const cacheKey = `org:${organizationId}:trainers:${searchParams.toString()}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const filters: TrainersFilter = {
      name: searchParams.get('name') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      isVisible: searchParams.has('isVisible')
        ? searchParams.get('isVisible') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
    }

    const result = await trainersService.getAllTrainers(organizationId, filters)

    await cache.set(cacheKey, result, 300)

    return NextResponse.json(result)
  }
)

export const POST = withAuth(PERMISSION_MODULES.STAFF, PERMISSION_ACTIONS.CREATE)(
  async (req, { organizationId }) => {
    const body = await req.json()
    const validation = trainerSchema.safeParse(body)

    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Datos de formulario inválidos'
      return NextResponse.json({ error: firstError, details: validation.error.format() }, { status: 400 })
    }

    const { ...trainerData } = validation.data
    const newTrainer = await trainersService.createTrainer(organizationId, trainerData)

    await cache.invalidate(`org:${organizationId}:trainers:*`)

    return NextResponse.json(newTrainer, { status: 201 })
  }
)