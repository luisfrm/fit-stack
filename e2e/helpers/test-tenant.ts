/**
 * Test tenant of the normal suite — FIXED, deterministic identities.
 *
 * E2E project rule: the tests use literal data (names, emails,
 * slugs), never random uuids. The global-setup DELETES and recreates this tenant
 * on every run (`e2e-suite` + `e2e-empty`), and the global-teardown deletes it
 * at the end: the suite leaves no evidence.
 *
 * This is NOT the demo data seed (org `Fit Stack` / `fit-stack`, which
 * `pnpm seed:e2e` fills and is never deleted). Do not confuse both worlds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_PASSWORD } from './api';

// ── App URLs (single source: playwright.config.ts also uses them) ────────────
export const PANEL_URL = process.env.PANEL_URL ?? 'http://localhost:3001';
export const CONSOLE_URL = process.env.CONSOLE_URL ?? 'http://localhost:3000';
export const API_URL = process.env.API_BASE_URL ?? 'http://localhost:8788';

// ── State paths ──────────────────────────────────────────────────────────────
export const AUTH_DIR = join(process.cwd(), 'e2e', '.auth');
export const STATE_PATH = join(AUTH_DIR, 'state.json');
export const PANEL_STATE_PATH = join(AUTH_DIR, 'panel-user.json');
export const CONSOLE_STATE_PATH = join(AUTH_DIR, 'console-user.json');
/** Session of the owner of the EMPTY org (`e2e-empty`) — see `empty-state.spec.ts`. */
export const EMPTY_STATE_PATH = join(AUTH_DIR, 'empty-org-user.json');

// ── Suite organization (own, ephemeral: created and deleted) ────────────────
export const TEST_ORG = {
  slug: 'e2e-suite',
  name: 'Gym E2E Suite',
  countryCode: 'VE',
  timezone: 'America/Caracas',
  primaryCurrency: 'VES',
  currencyFormat: 'latam',
} as const;

// ── Empty organization (for the empty-state specs; also ephemeral) ──────────
export const EMPTY_ORG = {
  slug: 'e2e-empty',
  name: 'Gym E2E Vacía',
  countryCode: 'VE',
  timezone: 'America/Caracas',
  primaryCurrency: 'VES',
  currencyFormat: 'latam',
} as const;

// ── Reserved users ───────────────────────────────────────────────────────────
export const TEST_OWNER = {
  email: 'e2e-suite-owner@e2e.test',
  password: TEST_PASSWORD,
  name: 'Owner E2E',
  firstName: 'Owner',
  lastName: 'E2E',
} as const;

export const EMPTY_OWNER = {
  email: 'e2e-empty-owner@e2e.test',
  password: TEST_PASSWORD,
  name: 'Owner E2E Vacía',
  firstName: 'Owner',
  lastName: 'E2E Vacía',
} as const;

export const TEST_PLATFORM = {
  email: 'e2e-platform@e2e.test',
  password: TEST_PASSWORD,
  name: 'Platform E2E',
} as const;

/** Emails the reset/teardown always deletes (explicit list, not `%pattern`). */
export const RESERVED_EMAILS = [TEST_OWNER.email, EMPTY_OWNER.email, TEST_PLATFORM.email] as const;

/** Org slugs the reset/teardown always deletes. */
export const SUITE_ORG_SLUGS = [TEST_ORG.slug, EMPTY_ORG.slug] as const;

// ── Data seeded by the global-setup (literals for the assertions) ────────────
export const TEST_PLAN = {
  name: 'Plan E2E Mensual',
  price: 50,
  currency: 'USD',
  durationValue: 1,
  durationUnit: 'month',
  features: ['Acceso completo', 'Clases grupales'],
} as const;

export const TEST_PLATFORM_PLAN = {
  name: 'Plan Plataforma E2E',
  price: 9900, // cents
  currency: 'USD',
  durationValue: 1,
  durationUnit: 'month',
  trialDays: 14,
} as const;

export const TEST_MEMBERS = {
  active: {
    firstName: 'Ana',
    lastName: 'E2E Activa',
    email: 'e2e.ana@e2e.test',
    isActive: true,
  },
  withoutPlan: {
    firstName: 'Beto',
    lastName: 'E2E SinPlan',
    email: 'e2e.beto@e2e.test',
    isActive: true,
  },
  inactive: {
    firstName: 'Carla',
    lastName: 'E2E Inactiva',
    email: 'e2e.carla@e2e.test',
    isActive: false,
  },
} as const;

export const TEST_CLASS = {
  name: 'Crossfit E2E',
  trainerName: 'Coach E2E',
  capacity: 15,
  startTime: '18:00',
  endTime: '19:00',
  frequencyType: 'weekly' as const,
  // Every day: guarantees that a "next class" always exists and that the
  // weekly calendar has content on any day of the run.
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  location: 'Sala principal',
} as const;

export const TEST_CMS_PAGE = {
  title: 'Inicio E2E',
  slug: 'inicio-e2e',
  description: 'Página sembrada por el setup de E2E',
  metaTitle: 'Inicio E2E',
  metaDescription: 'Página de inicio sembrada por E2E',
  isActive: true,
} as const;

export const TEST_CMS_BLOCK = {
  blockType: 'hero' as const,
  data: {
    title: 'Bienvenido a Gym E2E',
    subtitle: 'Contenido sembrado por el setup de E2E',
    ctaText: 'Ver planes',
  },
} as const;

// ── State persisted between global-setup → setups → specs ────────────────────
export interface TestTenantState {
  orgId: string;
  orgSlug: string;
  ownerUserId: string;
  platformUserId: string;
  /** Empty org of the empty-state specs (same run, also ephemeral). */
  emptyOrgId: string;
  emptyOrgSlug: string;
  emptyOwnerEmail: string;
  /** Ids of the fixtures seeded by the global-setup. */
  ids: {
    planId: number;
    memberId: number;
    memberWithoutPlanId: number;
    inactiveMemberId: number;
    subscriptionId: number;
    paymentId: number;
    classId: number;
    cmsPageId: number;
    platformPlanId: number;
    platformSubscriptionId: number;
  };
  /**
   * true when the setup reused already existing users (e.g. a previous run with
   * `E2E_KEEP_DATA=1` whose teardown was skipped). The dev servers
   * are always reused locally (`reuseExistingServer`).
   */
  reusedExisting: boolean;
  createdAt: string;
}

export function writeTenantState(state: TestTenantState): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export function readTenantState(): TestTenantState {
  if (!existsSync(STATE_PATH)) {
    throw new Error(
      `No se encontró ${STATE_PATH}. El global-setup debió crearlo — ¿se saltó? Revisa playwright.config.ts.`,
    );
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as TestTenantState;
}

// ── Environment flags ────────────────────────────────────────────────────────
/**
 * `E2E_KEEP_DATA=1` skips the teardown to be able to inspect the tenant after
 * the run. It does not change the startup: the next run resets anyway,
 * so organizations never pile up.
 */
export const KEEP_DATA = process.env.E2E_KEEP_DATA === '1';

/** Routes visited once after login to take the Next (Turbopack) compile
 * out of the test time. */
export const PANEL_PREWARM_ROUTES = [
  '/dashboard',
  '/members',
  '/payments',
  '/classes',
  '/memberships',
  '/content',
  '/staff',
  '/trainers',
  '/settings/general',
] as const;

/** Routes the empty org needs: they are prewarmed with their own session so
 * that the empty-state specs do not absorb the cold compile. */
export const EMPTY_PANEL_PREWARM_ROUTES = ['/members', '/content'] as const;

export const CONSOLE_PREWARM_ROUTES = [
  '/dashboard',
  '/organizations',
  '/subscriptions',
  '/plans',
  '/staff',
  '/settings/general',
] as const;
