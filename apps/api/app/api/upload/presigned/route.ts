import { NextRequest, NextResponse } from 'next/server';
import { r2Service } from '@/services/r2.service';
import { getSession } from '@/config/get-session';

/**
 * Extracts the file extension from a filename.
 */
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) return 'bin';
  return filename.slice(lastDotIndex + 1);
}

/**
 * Cleans a string to be used as a filename (slug).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                     // Descomponer caracteres con tildes
    .replaceAll(/[\u0300-\u036f]/g, '')     // Eliminar tildes
    .replaceAll(/[^a-z0-9_-]/g, '-')        // Reemplazar caracteres no permitidos
    .replaceAll(/-+/g, '-')                 // Colapsar guiones múltiples
    .replaceAll(/^-|-$/g, '')               // Limpiar guiones en extremos
    .slice(0, 50);
}

/**
 * Constructs a unique storage key for R2.
 */
function constructStorageKey(orgId: string, folder: string, filename: string, customName?: string): string {
  const extension = getFileExtension(filename);
  const baseName = customName || filename.slice(0, filename.lastIndexOf('.')) || filename;

  const slug = slugify(baseName);
  const shortId = crypto.randomUUID().split('-')[0];

  return `${orgId}/${folder}/${slug}_${shortId}.${extension}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filename, contentType, folder = 'general', customName } = await req.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Filename and content type are required' }, { status: 400 });
    }

    const orgId = session.session.activeOrganizationId || 'public';
    const uniqueKey = constructStorageKey(orgId, folder, filename, customName);

    const result = await r2Service.getPresignedUploadUrl(uniqueKey, contentType);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
