/**
 * Platform permission matrix tests (Console / SaaS layer).
 *
 * Complements `permissions.test.ts` (tenant matrix) with the platform gate,
 * the platform action matrix and the panel-access regression rule. Every case
 * here mirrors a rule documented in `vaults/business/RBAC-STRUCTURE.md`.
 */
import { describe, expect, it } from "vitest";
import {
  canAccessConsole,
  canPlatform,
  type PlatformStatement,
} from "../src/access-control";
import { can } from "../src/permissions/can";
import { PERMISSION_ACTIONS } from "../src/permissions/actions";
import { PERMISSION_MODULES } from "../src/permissions/modules";
import { ORG_ROLES } from "../src/constants";

// ─── canAccessConsole(role) ────────────────────────────────────────────────

const consoleAccessCases: ReadonlyArray<
  readonly [string | null | undefined, boolean]
> = [
  ["owner", true],
  ["admin", true],
  ["support", false],
  ["user", false],
  ["", false],
  [null, false],
  [undefined, false],
];

describe("canAccessConsole(role)", () => {
  it.each(consoleAccessCases)("%s → %s", (role, expected) => {
    expect(canAccessConsole(role)).toBe(expected);
  });
});

// ─── canPlatform(role, module, action) ─────────────────────────────────────

const platformCases: ReadonlyArray<
  readonly [string, keyof PlatformStatement, string, boolean]
> = [
  // owner — full platform access
  ["owner", "organization", "create", true],
  ["owner", "organization", "delete", true],
  ["owner", "subscription", "list", true],
  ["owner", "subscription", "cancel", true],
  ["owner", "subscription", "extend", true],
  ["owner", "setting", "read", true],
  ["owner", "setting", "write", true],
  // admin — full tenant management, no organization delete
  ["admin", "organization", "create", true],
  ["admin", "organization", "delete", false],
  ["admin", "subscription", "list", true],
  ["admin", "subscription", "cancel", true],
  ["admin", "subscription", "extend", true],
  ["admin", "setting", "read", true],
  ["admin", "setting", "write", true],
  // support — read-only
  ["support", "organization", "create", false],
  ["support", "organization", "delete", false],
  ["support", "subscription", "list", true],
  ["support", "subscription", "cancel", false],
  ["support", "subscription", "extend", false],
  ["support", "setting", "read", true],
  ["support", "setting", "write", false],
];

describe("canPlatform(role, module, action)", () => {
  it.each(platformCases)(
    "%s · %s.%s → %s",
    (role, module, action, expected) => {
      expect(canPlatform(role, module, action)).toBe(expected);
    },
  );
});

// ─── Malformed roles never throw ───────────────────────────────────────────

const malformedRoles = [
  "toString",
  "constructor",
  "hasOwnProperty",
  "__proto__",
];

describe("malformed roles resolve to false", () => {
  it.each(malformedRoles)("canPlatform(%s) → false", (role) => {
    expect(canPlatform(role, "organization", "create")).toBe(false);
  });

  it.each(malformedRoles)("can(%s) → false", (role) => {
    expect(can(role, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)).toBe(
      false,
    );
  });
});

// ─── Panel access rule (regression) ────────────────────────────────────────

const panelAccessCases: ReadonlyArray<readonly [string, boolean]> = [
  [ORG_ROLES.OWNER, true],
  [ORG_ROLES.MANAGER, true],
  [ORG_ROLES.CASHIER, true],
  [ORG_ROLES.COACH, false],
  [ORG_ROLES.MEMBER, false],
];

describe("panel access rule", () => {
  it.each(panelAccessCases)("%s · panel.access → %s", (role, expected) => {
    expect(can(role, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)).toBe(
      expected,
    );
  });
});
