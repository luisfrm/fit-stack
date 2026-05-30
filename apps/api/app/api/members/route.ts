import { NextRequest, NextResponse } from 'next/server'
import { membersService } from '@/services/members.service'
import { getSession } from '@/config/get-session'
import {
  ORG_ROLES,
  OrgRole,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  canAssignRole,
} from '@workspace/shared'
import { cache } from '@/lib/cache'
import { authorize, getOrgContext } from '@/config/auth-utils'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const { searchParams } = req.nextUrl

    const isStaffList = searchParams.get('excludeRole') === ORG_ROLES.MEMBER
    const permissionModule = isStaffList ? PERMISSION_MODULES.STAFF : PERMISSION_MODULES.MEMBERS

    if (!authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cacheKey = `org:${organizationId}:members:${searchParams.toString()}`
    const cachedData = await cache.get(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const filters = {
      organizationId,
      query: searchParams.get('query') ?? undefined,
      role: searchParams.get('role') as OrgRole ?? undefined,
      excludeRole: searchParams.get('excludeRole') as OrgRole ?? undefined,
      isActive: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 10,
      requireTotal: true,
      includeLatestSubscription: searchParams.get('includeLatestSubscription') === 'true',
    }

    const result = await membersService.getAllMembers(filters)
    await cache.set(cacheKey, result, 300)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const body = await req.json()
    const { sendInvite, ...memberData } = body

    if (!memberData.firstName || !memberData.lastName || !memberData.email) {
      return NextResponse.json({ error: 'Nombre, apellido y correo son requeridos' }, { status: 400 })
    }

    const targetRole = (memberData.role ?? ORG_ROLES.MEMBER) as OrgRole
    const isStaff = targetRole !== ORG_ROLES.MEMBER
    const permissionModule = isStaff ? PERMISSION_MODULES.STAFF : PERMISSION_MODULES.MEMBERS

    if (!authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.CREATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ctx = getOrgContext(session, organizationId)
    if (!ctx || !canAssignRole(ctx.memberRole, targetRole)) {
      return NextResponse.json({ error: 'Forbidden: cannot assign this role' }, { status: 403 })
    }

    const newMember = await membersService.createMember(organizationId, memberData, sendInvite === true)

    await cache.invalidate(`org:${organizationId}:members:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json(newMember, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al crear el miembro'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
