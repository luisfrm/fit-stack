import { NextRequest, NextResponse } from 'next/server'
import { settingsService } from '@/services/settings.service'
import { getSession } from '@/config/get-session'

/**
 * GET: Retrieves all gym settings.
 * URL: /api/settings
 */
export async function GET(req: NextRequest) {
  try {
    const allSettings = await settingsService.getAll()
    return NextResponse.json(allSettings)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST: Batch upsert settings.
 * URL: /api/settings
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify permission
    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes("settings.general:manage")) {
      return NextResponse.json(
        { error: "Forbidden: No tienes permiso para gestionar la configuración." },
        { status: 403 }
      );
    }

    const body = await req.json()
    
    // Handle Record<string, string>
    if (typeof body === 'object' && !Array.isArray(body)) {
      const entries = Object.entries(body);
      for (const [key, value] of entries) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          await settingsService.upsert(key, String(value));
        }
      }
      return NextResponse.json({ success: true, count: entries.length })
    }

    // Fallback for single key-value: { key: "...", value: "..." }
    const { key, value } = body
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and Value are required' }, { status: 400 })
    }

    await settingsService.upsert(key, String(value))
    return NextResponse.json({ success: true, key, value }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
