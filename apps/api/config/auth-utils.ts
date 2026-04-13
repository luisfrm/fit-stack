import { GLOBAL_ROLES, ORG_ROLES } from "@workspace/shared";

import { auth } from "./auth";

// ── TYPE ──────────────────────────────────────────────────────────────────────

type AnySession = (typeof auth.$Infer.Session & { member?: { role: string } }) | null;

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Returns the active organization ID and member role from a session.
 * Returns null if the session is invalid or has no active org.
 */
function getOrgContext(session: AnySession, organizationId: string) {
  if (!session) return null;

  const activeOrgId = session.session?.activeOrganizationId;
  if (activeOrgId !== organizationId) return null;

  return {
    memberRole: session.member?.role,
    isGlobalAdmin: session.user?.role === GLOBAL_ROLES.ADMIN,
  };
}

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

/**
 * Can manage organization settings (name, logo, plan, etc.).
 * Allowed: Global Admin, Owner, Manager.
 */
export function canManageOrganization(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return session?.user?.role === GLOBAL_ROLES.ADMIN; // global admin bypass

  const { memberRole, isGlobalAdmin } = ctx;
  return isGlobalAdmin ||
    memberRole === ORG_ROLES.OWNER ||
    memberRole === ORG_ROLES.MANAGER;
}

/**
 * Can manage gym members (create, update, delete gym_member records).
 * Allowed: Global Admin, Owner, Manager, Cashier.
 */
export function canManageMembers(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return session?.user?.role === GLOBAL_ROLES.ADMIN;

  const { memberRole, isGlobalAdmin } = ctx;
  return isGlobalAdmin ||
    memberRole === ORG_ROLES.OWNER ||
    memberRole === ORG_ROLES.MANAGER ||
    memberRole === ORG_ROLES.CASHIER;
}

/**
 * Can read/list gym members.
 * Allowed: Global Admin, Owner, Manager, Cashier, Coach.
 */
export function canReadMembers(session: AnySession, organizationId: string): boolean {
  const ctx = getOrgContext(session, organizationId);
  if (!ctx) return session?.user?.role === GLOBAL_ROLES.ADMIN;

  const { memberRole, isGlobalAdmin } = ctx;
  return isGlobalAdmin ||
    memberRole === ORG_ROLES.OWNER ||
    memberRole === ORG_ROLES.MANAGER ||
    memberRole === ORG_ROLES.CASHIER ||
    memberRole === ORG_ROLES.COACH;
}

/**
 * Can manage classes and schedules (create, update, delete).
 * Allowed: Global Admin, Owner, Manager.
 */
export function canManageClasses(session: AnySession, organizationId: string): boolean {
  return canManageOrganization(session, organizationId);
}

/**
 * Can manage payments (register, validate, void).
 * Allowed: Global Admin, Owner, Manager, Cashier.
 */
export function canManagePayments(session: AnySession, organizationId: string): boolean {
  return canManageMembers(session, organizationId); // Same audience as member management
}

/**
 * Can manage gym settings (gym_setting table).
 * Allowed: Global Admin, Owner, Manager.
 */
export function canManageSettings(session: AnySession, organizationId: string): boolean {
  return canManageOrganization(session, organizationId); // Same audience
}
