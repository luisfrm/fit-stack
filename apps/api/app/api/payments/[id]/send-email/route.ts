import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/config/get-session'
import { subscriptionsService } from '@/services/subscriptions.service'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const organizationId = session?.session?.activeOrganizationId

    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { id } = await params
    const paymentId = Number.parseInt(id)
    if (Number.isNaN(paymentId)) {
      return NextResponse.json({ error: 'ID de pago inválido' }, { status: 400 })
    }

    const success = await subscriptionsService.sendReceiptEmail(organizationId, paymentId)

    if (success) {
      return NextResponse.json({ success: true, message: 'Correo enviado correctamente' })
    } else {
      return NextResponse.json({ error: 'Fallo al enviar el correo' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Error in send-email route:', error)
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
  }
}
