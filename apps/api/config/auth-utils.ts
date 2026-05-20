import { ORG_ROLES } from "@workspace/shared";
import { auth } from "./auth";

type AnySession = (typeof auth.$Infer.Session & { member?: { role: string } }) | null;

function getOrgContext(session: AnySession, organizationId: string) {
  if (!session) return null;

  const activeOrgId = session.session?.activeOrganizationId;
  if (activeOrgId !== organizationId) return null;

  return {
    memberRole: session.member?.role,
  };
}

export function canManageOrganization(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER
  );
}

export function canManageMembers(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER ||
    ctx.memberRole === ORG_ROLES.CASHIER
  );
}

export function canReadMembers(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER ||
    ctx.memberRole === ORG_ROLES.CASHIER ||
    ctx.memberRole === ORG_ROLES.COACH
  );
}

export function canManageClasses(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER ||
    ctx.memberRole === ORG_ROLES.CASHIER
  );
}

export function canManageRoutines(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER ||
    ctx.memberRole === ORG_ROLES.COACH
  );
}

export function canManagePayments(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER ||
    ctx.memberRole === ORG_ROLES.CASHIER
  );
}

export function canManageSettings(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return false;

  return (
    ctx.memberRole === ORG_ROLES.OWNER ||
    ctx.memberRole === ORG_ROLES.MANAGER
  );
}