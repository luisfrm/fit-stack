import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const organizationId = session.session.activeOrganizationId;

    const filters = {
      organizationId,
      query: searchParams.get('query') ?? undefined,
      role: searchParams.has('role') ? searchParams.get('role')! : undefined,
      excludeRole: searchParams.has('excludeRole') ? searchParams.get('excludeRole')! : undefined,
      isActive: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
    }

    const result = await membersService.getAllMembers(filters)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const body = await req.json()
    // Destructure sendInvite if it's sent from the frontend
    const { sendInvite, ...memberData } = body;

    if (!memberData.firstName || !memberData.lastName || !memberData.email) {
      return NextResponse.json({ error: 'Nombre, apellido y correo son requeridos' }, { status: 400 })
    }

    const organizationId = session.session.activeOrganizationId;

    const newMember = await membersService.createMember(organizationId, memberData, sendInvite === true)
    return NextResponse.json(newMember, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
