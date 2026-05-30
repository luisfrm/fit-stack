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

function memberPermissionModule(role: string | undefined) {
  return role === ORG_ROLES.MEMBER
    ? PERMISSION_MODULES.MEMBERS
    : PERMISSION_MODULES.STAFF
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const { id: rawId } = await params
    const id = Number(rawId)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const existing = await membersService.getMemberById(organizationId, id)
    const permissionModule = memberPermissionModule(existing.role)

    if (!authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.UPDATE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    if (body.role) {
      const ctx = getOrgContext(session, organizationId)
      const targetRole = body.role as OrgRole
      if (!ctx || !canAssignRole(ctx.memberRole, targetRole)) {
        return NextResponse.json({ error: 'Forbidden: cannot assign this role' }, { status: 403 })
      }
    }

    const updatedMember = await membersService.updateMember(organizationId, id, body)

    await cache.invalidate(`org:${organizationId}:members:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json(updatedMember)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: 'Unauthorized or no active organization' }, { status: 401 })
    }

    const organizationId = session.session.activeOrganizationId
    const { id: rawId } = await params
    const id = Number(rawId)
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const existing = await membersService.getMemberById(organizationId, id)
    const permissionModule = memberPermissionModule(existing.role)

    if (!authorize(session, organizationId, permissionModule, PERMISSION_ACTIONS.DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await membersService.deleteMember(organizationId, id)

    await cache.invalidate(`org:${organizationId}:members:*`)
    await cache.invalidate(`org:${organizationId}:dashboard:stats:*`)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
