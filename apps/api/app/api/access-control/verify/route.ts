import { NextRequest, NextResponse } from 'next/server';
import { accessControlRepository } from '@/repositories/access-control.repository';

/**
 * POST /api/access-control/verify
 * Receives organizationId and documentId. Returns if access is granted or denied.
 * Creates an audit log of the attempt.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.ACCESS_CONTROL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organizationId, documentId } = await req.json();

    if (!organizationId || !documentId) {
      return NextResponse.json({ error: 'Missing organizationId or documentId' }, { status: 400 });
    }

    // 1. Verify access in DB
    const verification = await accessControlRepository.verifyAccess(organizationId, documentId);

    // 2. Create the log
    await accessControlRepository.createLog({
      organizationId,
      memberId: verification.memberId,
      documentId,
      status: verification.allowed ? 'granted' : 'denied',
      accessType: 'face',
      metadata: { 
        message: verification.message,
        timestamp: new Date().toISOString()
      }
    });

    return NextResponse.json({
        allowed: verification.allowed,
        message: verification.message,
        memberName: verification.name ?? 'Desconocido',
        memberId: verification.memberId
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
