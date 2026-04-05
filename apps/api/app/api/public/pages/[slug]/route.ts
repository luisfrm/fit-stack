import { NextResponse } from 'next/server'
import { cmsBlocksService } from '@/services/cms-blocks.service'

/**
 * Public Endpoint: Fetch full page content by slug.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const organizationId = _request.headers.get('x-organization-id');
    
    if (!organizationId) {
      return NextResponse.json({ error: 'Falta encabezado x-organization-id' }, { status: 400 });
    }

    const pageContent = await cmsBlocksService.getPublicPage(organizationId, slug)
    return NextResponse.json(pageContent)
  } catch (error: any) {
    if (error.message.includes('No se pudo encontrar') || error.message.includes('inactiva')) {
      return NextResponse.json({ error: 'Página no encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
