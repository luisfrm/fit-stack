import { NextRequest, NextResponse } from 'next/server'
import { coachesService } from '@/services/coaches.service'
import { getSession } from '@/config/get-session'

import { z } from 'zod';

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
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl

    const filters = {
      name: searchParams.get('name') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      isVisible: searchParams.has('isVisible')
        ? searchParams.get('isVisible') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
    }

    const result = await coachesService.getAllCoaches(filters)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validation = coachSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Datos de formulario inválidos';
      return NextResponse.json({ error: firstError, details: validation.error.format() }, { status: 400 })
    }

    const newCoach = await coachesService.createCoach(validation.data)
    return NextResponse.json(newCoach, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
