import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl

    const filters = {
      query: searchParams.get('query') ?? undefined,
      roleId: searchParams.has('roleId') ? Number(searchParams.get('roleId')) : undefined,
      excludeRoleId: searchParams.has('excludeRoleId') ? Number(searchParams.get('excludeRoleId')) : undefined,
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
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    // Destructure sendInvite if it's sent from the frontend
    const { sendInvite, ...memberData } = body;

    if (!memberData.firstName || !memberData.lastName || !memberData.email) {
      return NextResponse.json({ error: 'Nombre, apellido y correo son requeridos' }, { status: 400 })
    }

    const newMember = await membersService.createMember(memberData, sendInvite === true)
    return NextResponse.json(newMember, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
