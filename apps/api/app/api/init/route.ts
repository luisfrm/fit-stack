import { NextRequest, NextResponse } from 'next/server';
import { initService } from '@/services/init.service';

/**
 * GET /api/init
 * Verifica si el sistema necesita configuración inicial (si no hay usuarios).
 */
export async function GET() {
  try {
    const { needsInit } = await initService.checkNeedsInit();

    return NextResponse.json({
      needsInit,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/init
 * Crea el primer usuario Super Admin del sistema. Solo funciona si no hay usuarios.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Nombre, email y contraseña son requeridos.' },
        { status: 400 }
      );
    }

    const adminUser = await initService.initializeAdmin({ email, password, name });

    return NextResponse.json({
      success: true,
      message: 'Administrador maestro creado con éxito.',
      user: adminUser
    });

  } catch (error: any) {
    console.error('Error in /api/init:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 400 }
    );
  }
}
