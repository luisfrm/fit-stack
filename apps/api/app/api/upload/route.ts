import { NextRequest, NextResponse } from 'next/server';
import { r2Service } from '@/services/r2.service';
import { getSession } from '@/config/get-session';

/**
 * Handle listing of files in a specific folder.
 * GET /api/upload?folder=coaches
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder') || '';
    const orgId = session.session.activeOrganizationId || 'public';
    
    // El prefijo siempre empieza por el ID de la organización para asegurar el aislamiento
    const prefix = `${orgId}/${folder}`;
    
    const files = await r2Service.listFiles(prefix);
    return NextResponse.json(files);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Handle deletion of a specific file.
 * DELETE /api/upload?key=orgId/folder/filename.ext
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    // Verificación de seguridad: el usuario solo puede borrar archivos de su organización
    const orgId = session.session.activeOrganizationId || 'public';
    if (!key.startsWith(`${orgId}/`)) {
      return NextResponse.json({ error: 'Forbidden: No tienes permiso para borrar este archivo.' }, { status: 403 });
    }

    await r2Service.deleteFile(key);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
