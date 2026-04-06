import { NextRequest, NextResponse } from 'next/server';
import { accessControlRepository } from '@/repositories/access-control.repository';

/**
 * POST /api/access-control/mark-synced
 * Receives identification of a task and updates its status.
 * Used by the Bridge app once it successfully pushes a face to the device.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.ACCESS_CONTROL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId, status, error } = await req.json();

    if (!taskId || !status || !['completed', 'error'].includes(status)) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    const task = await accessControlRepository.updateTaskStatus(taskId, status, error);
    
    return NextResponse.json({ 
        success: true, 
        message: 'Estado de tarea actualizado',
        taskId: task?.id
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
