import { NextRequest, NextResponse } from 'next/server'
import { classesService } from '@/services/classes.service'
import { getSession } from '@/config/get-session'
import { cache } from '@/lib/cache';

/**
 * Validates the body of a POST/PUT class request.
 */
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

type Validator = (body: Record<string, unknown>) => string | null;

function validateFrequency(body: Record<string, unknown>): string | null {
  const freq = body.frequencyType;
  if (freq !== 'once' && freq !== 'weekly') {
    return 'frequencyType must be either "once" or "weekly"';
  }
  if (freq === 'once') {
    if (!body.scheduledDate || typeof body.scheduledDate !== 'string') {
      return 'scheduledDate is required when frequencyType is "once"';
    }
    if (Number.isNaN(Date.parse(body.scheduledDate))) {
      return 'scheduledDate must be a valid ISO date (YYYY-MM-DD)';
    }
  }
  if (freq === 'weekly') {
    const days = body.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0) {
      return 'daysOfWeek must be a non-empty array when frequencyType is "weekly"';
    }
    if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return 'daysOfWeek values must be integers between 0 (Sunday) and 6 (Saturday)';
    }
  }
  return null;
}

const CLASS_VALIDATORS: Validator[] = [
  (b) => (!b.name || typeof b.name !== 'string')
    ? 'name is required and must be a string'
    : null,
  (b) => {
    if (!b.startTime || typeof b.startTime !== 'string') return 'startTime is required (format HH:MM)';
    if (!TIME_REGEX.test(b.startTime)) return 'startTime must be a valid time in HH:MM format';
    return null;
  },
  (b) => (b.endTime && !TIME_REGEX.test(b.endTime as string))
    ? 'endTime must be a valid time in HH:MM format'
    : null,
  (b) => validateFrequency(b),
  (b) => (b.capacity !== undefined && (typeof b.capacity !== 'number' || b.capacity < 1))
    ? 'capacity must be a positive number'
    : null,
];

function validateClassBody(body: Record<string, unknown>): string[] {
  return CLASS_VALIDATORS.map((v) => v(body)).filter((e): e is string => e !== null);
}

/**
 * GET /api/classes
 *
 * Mode A — Clases del día (dashboard):
 *   ?date=2026-03-30  → devuelve array de clases para esa fecha (once + weekly que apliquen)
 *
 * Mode B — Listado paginado (CMS):
 *   ?name=yoga&trainerName=carlos&isVisible=true&page=1&limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const cacheKey = `org:${organizationId}:classes:${searchParams.toString()}`

    // Try to get from cache
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const date = searchParams.get('date')

    if (date) {
      const classes = await classesService.getByDate(organizationId, date)
      await cache.set(cacheKey, classes, 300) // 5 minutes
      return NextResponse.json(classes)
    }

    const filters = {
      name: searchParams.get('name') ?? undefined,
      trainerName: searchParams.get('trainerName') ?? undefined,
      isVisible: searchParams.has('isVisible')
        ? searchParams.get('isVisible') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true, // needed for CMS pagination UI
    }

    const result = await classesService.getAll(organizationId, filters)
    await cache.set(cacheKey, result, 300) // 5 minutes
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/classes
 * Body: { name, timeInfo, description?, trainerName?, isVisible? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const body = await req.json()
    const errors = validateClassBody(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const newClass = await classesService.create(organizationId, body)
    return NextResponse.json(newClass, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
