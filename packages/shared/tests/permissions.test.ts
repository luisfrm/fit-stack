/**
 * Permission system unit tests.
 *
 * These are the most critical regression guards in the project — every test
 * here validates a business rule from the RBAC permission matrix in AGENTS.md.
 */
import { describe, expect, it } from 'vitest';
import { can, canAny } from '../src/permissions/can';
import { canAssignRole, canAssignPlatformRole } from '../src/permissions/role-assignment';
import { ORG_ROLES } from '../src/constants';

// ─── can(role, module, action) ──────────────────────────────────────────────

describe('can(role, module, action)', () => {
  it('returns false for null/empty role', () => {
    expect(can('', 'members', 'read')).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(can('hacker', 'members', 'read')).toBe(false);
  });

  describe('Owner — full access', () => {
    it('can CRUD members', () => {
      expect(can(ORG_ROLES.OWNER, 'members', 'read')).toBe(true);
      expect(can(ORG_ROLES.OWNER, 'members', 'create')).toBe(true);
      expect(can(ORG_ROLES.OWNER, 'members', 'update')).toBe(true);
      expect(can(ORG_ROLES.OWNER, 'members', 'delete')).toBe(true);
    });

    it('can CRUD plans', () => {
      expect(can(ORG_ROLES.OWNER, 'plans', 'create')).toBe(true);
      expect(can(ORG_ROLES.OWNER, 'plans', 'delete')).toBe(true);
    });

    it('can access settings', () => {
      expect(can(ORG_ROLES.OWNER, 'settings', 'read')).toBe(true);
      expect(can(ORG_ROLES.OWNER, 'settings', 'update')).toBe(true);
    });

    it('can access panel', () => {
      expect(can(ORG_ROLES.OWNER, 'panel', 'access')).toBe(true);
    });

    it('can access dashboard', () => {
      expect(can(ORG_ROLES.OWNER, 'dashboard', 'read')).toBe(true);
    });
  });

  describe('Manager — full tenant control, no delete', () => {
    it('can read/create/update members but NOT delete', () => {
      expect(can(ORG_ROLES.MANAGER, 'members', 'read')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'members', 'create')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'members', 'update')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'members', 'delete')).toBe(false);
    });

    it('can CRUD staff', () => {
      expect(can(ORG_ROLES.MANAGER, 'staff', 'read')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'staff', 'create')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'staff', 'update')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'staff', 'delete')).toBe(false);
    });

    it('can access settings', () => {
      expect(can(ORG_ROLES.MANAGER, 'settings', 'read')).toBe(true);
      expect(can(ORG_ROLES.MANAGER, 'settings', 'update')).toBe(true);
    });

    it('can access panel', () => {
      expect(can(ORG_ROLES.MANAGER, 'panel', 'access')).toBe(true);
    });
  });

  describe('Cashier — limited access', () => {
    it('can read/create/update members but NOT delete', () => {
      expect(can(ORG_ROLES.CASHIER, 'members', 'read')).toBe(true);
      expect(can(ORG_ROLES.CASHIER, 'members', 'create')).toBe(true);
      expect(can(ORG_ROLES.CASHIER, 'members', 'update')).toBe(true);
      expect(can(ORG_ROLES.CASHIER, 'members', 'delete')).toBe(false);
    });

    it('CANNOT access staff module', () => {
      expect(can(ORG_ROLES.CASHIER, 'staff', 'read')).toBe(false);
      expect(can(ORG_ROLES.CASHIER, 'staff', 'create')).toBe(false);
    });

    it('can read settings but NOT update', () => {
      expect(can(ORG_ROLES.CASHIER, 'settings', 'read')).toBe(true);
      expect(can(ORG_ROLES.CASHIER, 'settings', 'update')).toBe(false);
    });

    it('can read plans but NOT create/delete', () => {
      expect(can(ORG_ROLES.CASHIER, 'plans', 'read')).toBe(true);
      expect(can(ORG_ROLES.CASHIER, 'plans', 'create')).toBe(false);
      expect(can(ORG_ROLES.CASHIER, 'plans', 'delete')).toBe(false);
    });

    it('can access panel', () => {
      expect(can(ORG_ROLES.CASHIER, 'panel', 'access')).toBe(true);
    });
  });

  describe('Coach — limited', () => {
    it('can read plans but NOT create/delete', () => {
      expect(can(ORG_ROLES.COACH, 'plans', 'read')).toBe(true);
      expect(can(ORG_ROLES.COACH, 'plans', 'create')).toBe(false);
    });

    it('CANNOT access members module', () => {
      expect(can(ORG_ROLES.COACH, 'members', 'read')).toBe(false);
    });

    it('CANNOT access panel', () => {
      expect(can(ORG_ROLES.COACH, 'panel', 'access')).toBe(false);
    });

    it('CANNOT access settings', () => {
      expect(can(ORG_ROLES.COACH, 'settings', 'read')).toBe(false);
    });
  });

  describe('Member — minimal access', () => {
    it('can read plans', () => {
      expect(can(ORG_ROLES.MEMBER, 'plans', 'read')).toBe(true);
    });

    it('CANNOT create/delete plans', () => {
      expect(can(ORG_ROLES.MEMBER, 'plans', 'create')).toBe(false);
    });

    it('CANNOT access panel', () => {
      expect(can(ORG_ROLES.MEMBER, 'panel', 'access')).toBe(false);
    });

    it('CANNOT access members', () => {
      expect(can(ORG_ROLES.MEMBER, 'members', 'read')).toBe(false);
    });

    it('CANNOT access settings', () => {
      expect(can(ORG_ROLES.MEMBER, 'settings', 'read')).toBe(false);
    });
  });
});

// ─── canAny() ───────────────────────────────────────────────────────────────

describe('canAny(role, checks)', () => {
  it('returns true if at least one check passes', () => {
    const checks: ReadonlyArray<readonly [string, string]> = [
      ['plans', 'create'],  // false for cashier
      ['plans', 'read'],    // true for cashier
    ];
    expect(canAny(ORG_ROLES.CASHIER, checks)).toBe(true);
  });

  it('returns false if no check passes', () => {
    const checks: ReadonlyArray<readonly [string, string]> = [
      ['plans', 'create'],
      ['plans', 'delete'],
    ];
    expect(canAny(ORG_ROLES.CASHIER, checks)).toBe(false);
  });

  it('returns false for empty checks', () => {
    expect(canAny(ORG_ROLES.OWNER, [])).toBe(false);
  });
});

// ─── canAssignRole() — Org anti-escalation ──────────────────────────────────

describe('canAssignRole(actor, target)', () => {
  describe('Owner can assign anyone', () => {
    it.each(Object.values(ORG_ROLES))('owner → %s ✓', (role) => {
      expect(canAssignRole(ORG_ROLES.OWNER, role)).toBe(true);
    });
  });

  describe('Manager cannot assign Owner', () => {
    it('manager → owner ✗', () => {
      expect(canAssignRole(ORG_ROLES.MANAGER, ORG_ROLES.OWNER)).toBe(false);
    });

    it.each([ORG_ROLES.MANAGER, ORG_ROLES.CASHIER, ORG_ROLES.COACH, ORG_ROLES.MEMBER])(
      'manager → %s ✓',
      (role) => {
        expect(canAssignRole(ORG_ROLES.MANAGER, role)).toBe(true);
      },
    );
  });

  describe('Cashier can only assign Member', () => {
    it('cashier → member ✓', () => {
      expect(canAssignRole(ORG_ROLES.CASHIER, ORG_ROLES.MEMBER)).toBe(true);
    });

    it('cashier → owner ✗', () => {
      expect(canAssignRole(ORG_ROLES.CASHIER, ORG_ROLES.OWNER)).toBe(false);
    });

    it('cashier → manager ✗', () => {
      expect(canAssignRole(ORG_ROLES.CASHIER, ORG_ROLES.MANAGER)).toBe(false);
    });

    it('cashier → cashier ✗', () => {
      expect(canAssignRole(ORG_ROLES.CASHIER, ORG_ROLES.CASHIER)).toBe(false);
    });
  });

  describe('Coach/Member cannot assign anyone', () => {
    it('coach → member ✗', () => {
      expect(canAssignRole(ORG_ROLES.COACH, ORG_ROLES.MEMBER)).toBe(false);
    });

    it('member → member ✗', () => {
      expect(canAssignRole(ORG_ROLES.MEMBER, ORG_ROLES.MEMBER)).toBe(false);
    });
  });
});

// ─── canAssignPlatformRole() — Platform anti-escalation ─────────────────────

describe('canAssignPlatformRole(actor, target)', () => {
  describe('Platform owner can assign anyone', () => {
    it('owner → admin ✓', () => {
      expect(canAssignPlatformRole('owner', 'admin')).toBe(true);
    });

    it('owner → support ✓', () => {
      expect(canAssignPlatformRole('owner', 'support')).toBe(true);
    });

    it('owner → owner ✓', () => {
      expect(canAssignPlatformRole('owner', 'owner')).toBe(true);
    });
  });

  describe('Platform admin can assign admin/support, NEVER owner', () => {
    it('admin → admin ✓', () => {
      expect(canAssignPlatformRole('admin', 'admin')).toBe(true);
    });

    it('admin → support ✓', () => {
      expect(canAssignPlatformRole('admin', 'support')).toBe(true);
    });

    it('admin → owner ✗', () => {
      expect(canAssignPlatformRole('admin', 'owner')).toBe(false);
    });
  });

  describe('Support cannot assign anyone', () => {
    it('support → admin ✗', () => {
      expect(canAssignPlatformRole('support', 'admin')).toBe(false);
    });

    it('support → support ✗', () => {
      expect(canAssignPlatformRole('support', 'support')).toBe(false);
    });

    it('support → owner ✗', () => {
      expect(canAssignPlatformRole('support', 'owner')).toBe(false);
    });
  });

  describe('Regular users cannot assign', () => {
    it('user → admin ✗', () => {
      expect(canAssignPlatformRole('user' as any, 'admin')).toBe(false);
    });
  });
});
