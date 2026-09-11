/**
 * Tenant de pruebas de la suite normal — identidades FIJAS y deterministas.
 *
 * Regla del proyecto E2E: los tests usan datos literales (nombres, emails,
 * slugs), nunca uuid aleatorios. El global-setup BORRA y recrea este tenant en
 * cada corrida (`e2e-suite` + `e2e-empty`), y el global-teardown lo borra al
 * final: la suite no deja evidencias.
 *
 * Esto NO es el seed de datos de demo (org `Fit Stack` / `fit-stack`, que
 * rellena `pnpm seed:e2e` y nunca se borra). No confundir ambos mundos.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_PASSWORD } from './api';

// ── URLs de las apps (única fuente: también las usa playwright.config.ts) ────
export const PANEL_URL = process.env.PANEL_URL ?? 'http://localhost:3001';
export const CONSOLE_URL = process.env.CONSOLE_URL ?? 'http://localhost:3000';
export const API_URL = process.env.API_BASE_URL ?? 'http://localhost:8788';

// ── Rutas de estado ──────────────────────────────────────────────────────────
export const AUTH_DIR = join(process.cwd(), 'e2e', '.auth');
export const STATE_PATH = join(AUTH_DIR, 'state.json');
export const PANEL_STATE_PATH = join(AUTH_DIR, 'panel-user.json');
export const CONSOLE_STATE_PATH = join(AUTH_DIR, 'console-user.json');

// ── Organización de la suite (propia, efímera: se crea y se borra) ──────────
export const TEST_ORG = {
  slug: 'e2e-suite',
  name: 'Gym E2E Suite',
  countryCode: 'VE',
  timezone: 'America/Caracas',
  primaryCurrency: 'VES',
  currencyFormat: 'latam',
} as const;

// ── Organización vacía (para los specs de empty-state; también efímera) ─────
export const EMPTY_ORG = {
  slug: 'e2e-empty',
  name: 'Gym E2E Vacía',
  countryCode: 'VE',
  timezone: 'America/Caracas',
  primaryCurrency: 'VES',
  currencyFormat: 'latam',
} as const;

// ── Usuarios reservados ──────────────────────────────────────────────────────
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

/** Emails que el reset/teardown borra siempre (lista explícita, no `%pattern`). */
export const RESERVED_EMAILS = [TEST_OWNER.email, EMPTY_OWNER.email, TEST_PLATFORM.email] as const;

/** Slugs de orgs que el reset/teardown borra siempre. */
export const SUITE_ORG_SLUGS = [TEST_ORG.slug, EMPTY_ORG.slug] as const;

// ── Datos sembrados por el global-setup (literales para las aserciones) ──────
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
  price: 9900, // centavos
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
  // Todos los días: garantiza que siempre exista una "próxima clase" y que el
  // calendario semanal tenga contenido en cualquier día de la corrida.
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

// ── Estado persistido entre global-setup → setups → specs ────────────────────
export interface TestTenantState {
  orgId: string;
  orgSlug: string;
  ownerUserId: string;
  platformUserId: string;
  /** Org vacía de los specs de empty-state (misma corrida, también efímera). */
  emptyOrgId: string;
  emptyOrgSlug: string;
  emptyOwnerEmail: string;
  /** Ids de los fixtures sembrados por el global-setup. */
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
   * true cuando el setup reutilizó usuarios ya existentes (p. ej. corrida con
   * `E2E_KEEP_DATA=1` previa cuyo teardown se saltó). Los servidores dev
   * siempre se reutilizan en local (`reuseExistingServer`).
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

// ── Flags de entorno ─────────────────────────────────────────────────────────
/**
 * `E2E_KEEP_DATA=1` omite el teardown para poder inspeccionar el tenant después
 * de la corrida. No cambia el arranque: la corrida siguiente resetea igual,
 * así que nunca se acumulan organizaciones.
 */
export const KEEP_DATA = process.env.E2E_KEEP_DATA === '1';

/** Rutas que se visitan una vez tras el login para sacar la compilación de Next
 * (Turbopack) del tiempo de los tests. */
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

export const CONSOLE_PREWARM_ROUTES = [
  '/dashboard',
  '/organizations',
  '/subscriptions',
  '/plans',
  '/staff',
  '/settings/general',
] as const;
