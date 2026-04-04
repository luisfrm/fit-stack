import { NextRequest, NextResponse } from 'next/server'
import { settingsService } from '@/services/settings.service'
import { getSession } from '@/config/get-session'

/**
 * GET: Retrieves a specific setting value.
 * URL: /api/settings/[key]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params
    const value = await settingsService.getByKey(key)
    
    // Si no existe, devolvemos null o un objeto vacío según se prefiera.
    // El CMS espera { value: string } o similar.
    return NextResponse.json({ value: value ?? null })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST: Upserts a setting value.
 * URL: /api/settings/[key]
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { key } = await params
    const { value } = await req.json()

    if (value === undefined) {
      return NextResponse.json({ error: 'Value is required' }, { status: 400 })
    }

    await settingsService.upsert(key, value)
    return NextResponse.json({ success: true, key, value })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
