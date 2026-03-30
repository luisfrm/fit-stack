import { NextRequest, NextResponse } from 'next/server';
import { r2Service } from '@/services/r2.service';
import { getSession } from '@/config/get-session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { filename, contentType, folder = 'coaches' } = body;

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Filename and content type are required' }, { status: 400 });
    }

    // Generar prefijo único
    const extension = filename.split('.').pop();
    const uniqueKey = `${folder}/${crypto.randomUUID()}.${extension}`;

    const result = await r2Service.getPresignedUploadUrl(uniqueKey, contentType);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
