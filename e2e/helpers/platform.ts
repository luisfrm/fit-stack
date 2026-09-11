/**
 * Provisioning del tenant de la suite (solo lo usan el global-setup y los
 * setups de login; los specs consumen `fixtures.ts`).
 *
 * Flujo de la suite normal: usuario de consola → crea la org vía el endpoint
 * de plataforma (el mismo camino que la consola) → aprovisiona el owner del
 * panel → siembra. Todo con identidades fijas y check-then-create donde aplica.
 */
import { addLocalDays, toLocalDayString } from '@workspace/shared';
import {
  apiJson,
  registerUser,
  setActiveOrganization,
  signIn,
  TEST_PASSWORD,
  type TestOrganization,
} from './api';
import { findOrganizationIdBySlug, findUserIdByEmail, isOrgAuthMember, setUserPlatformRole } from './db';
import {
  EMPTY_ORG,
  EMPTY_OWNER,
  TEST_CMS_BLOCK,
  TEST_CMS_PAGE,
  TEST_CLASS,
  TEST_MEMBERS,
  TEST_ORG,
  TEST_OWNER,
  TEST_PLATFORM,
  TEST_PLAN,
  TEST_PLATFORM_PLAN,
} from './test-tenant';

/** Definición mínima de org que aceptan los ensures (suite y seed). */
export interface OrgDef {
  slug: string;
  name: string;
  countryCode: string;
  timezone: string;
  currencyFormat: string;
}

/** Definición mínima de owner que aceptan los ensures (suite y seed). */
export interface OwnerDef {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}

/** Features completas para el plan de plataforma del tenant de pruebas. */
const ALL_FEATURES = {
  panel: { enabled: true },
  cms: { enabled: true },
  blog: { enabled: true },
  members_portal: { enabled: true, limits: { member_seats: 50 } },
  ai_chat: { enabled: true, limits: { ai_credits_monthly: 10_000 } },
} as const;

function todayIso(tz: string): string {
  return toLocalDayString(tz);
}

function isoInDays(tz: string, days: number): string {
  return addLocalDays(tz, toLocalDayString(tz), days);
}

/** Login si el usuario existe, alta si no. Devuelve cookies de sesión. */
export async function signInOrRegister(user: {
  email: string;
  password: string;
  name: string;
}): Promise<{ userId: string; cookies: string; existed: boolean }> {
  try {
    const cookies = await signIn(user.email, user.password);
    const userId = (await findUserIdByEmail(user.email)) ?? '';
    if (userId) return { userId, cookies, existed: true };
  } catch {
    // El usuario todavía no existe — se crea abajo.
  }

  const created = await registerUser({
    email: user.email,
    password: user.password,
    name: user.name,
  });
  const cookies = await signIn(user.email, user.password);
  return { userId: created.userId, cookies, existed: false };
}

// ── Consola: platform owner ──────────────────────────────────────────────────

export interface PlatformTenant {
  userId: string;
  cookies: string;
  existed: boolean;
}

/**
 * Garantiza el platform owner de la consola. La promoción de rol se hace por
 * SQL (el endpoint del admin plugin exige un admin preexistente) y se re-aplica
 * siempre, para que también funcione cuando el usuario viene del entorno.
 */
export async function ensurePlatformTenant(): Promise<PlatformTenant> {
  const { userId, cookies, existed } = await signInOrRegister(TEST_PLATFORM);
  await setUserPlatformRole(userId, 'owner');
  return { userId, cookies, existed };
}

// ── Suite: org creada por la consola + owner del panel ───────────────────────

export interface SuiteTenant {
  userId: string;
  cookies: string;
  organization: TestOrganization;
  orgExisted: boolean;
  ownerExisted: boolean;
}

/**
 * Crea la organización a través del endpoint de plataforma
 * (`POST /api/platform/organizations`), como lo haría la consola.
 * Idempotente por slug: si la org ya existe la reutiliza.
 */
export async function ensureSuiteOrganization(
  platformCookies: string,
  org: OrgDef,
): Promise<TestOrganization & { existed: boolean }> {
  const existingId = await findOrganizationIdBySlug(org.slug);
  if (existingId) {
    return { id: existingId, name: org.name, slug: org.slug, existed: true };
  }

  const created = await apiJson<{ id: string }>('/api/platform/organizations', {
    method: 'POST',
    cookies: platformCookies,
    body: {
      name: org.name,
      slug: org.slug,
      countryCode: org.countryCode,
      timezone: org.timezone,
      currencyFormat: org.currencyFormat,
    },
  });
  return { id: created.id, name: org.name, slug: org.slug, existed: false };
}

/**
 * Aprovisiona el owner del panel en una org creada por consola
 * (`POST /api/platform/organizations/:id/staff` con rol owner): crea el
 * `gym_member` y vincula el usuario existente como `auth_member` owner.
 * Idempotente: si el usuario ya es miembro de la org no hace nada.
 */
async function provisionOrgOwner(
  platformCookies: string,
  orgId: string,
  owner: OwnerDef,
): Promise<void> {
  const userId = await findUserIdByEmail(owner.email);
  if (userId && (await isOrgAuthMember(userId, orgId))) return;

  await apiJson(`/api/platform/organizations/${orgId}/staff`, {
    method: 'POST',
    cookies: platformCookies,
    body: {
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email,
      role: 'owner',
      isActive: true,
      sendInvite: false,
    },
  });
}

/**
 * Tenant completo de la suite: consola → org → owner del panel con la org
 * activa. Es el flujo real (la org nace desde la consola, no por Better Auth
 * directo).
 */
export async function ensureSuiteTenant(
  platform: PlatformTenant,
  org: OrgDef,
  owner: OwnerDef,
): Promise<SuiteTenant> {
  const { userId, cookies, existed: ownerExisted } = await signInOrRegister(owner);

  const organization = await ensureSuiteOrganization(platform.cookies, org);
  await provisionOrgOwner(platform.cookies, organization.id, owner);
  await setActiveOrganization(cookies, organization.id);

  return {
    userId,
    cookies,
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    orgExisted: organization.existed,
    ownerExisted,
  };
}

// ── Plataforma SaaS: plan + suscripción trial para la org ────────────────────

/**
 * Asegura el plan de plataforma de los tests.
 *
 * Es idempotente: lo REUTILIZA si ya existe por nombre, porque `platform_plan`
 * es catálogo (no cuelga de la organización y no se borra con ella). Sin esto,
 * cada corrida dejaría un plan nuevo en el listado de la consola.
 */
export async function ensurePlatformPlan(cookies: string): Promise<number> {
  const plans = await apiJson<Array<{ id: number; name: string }>>('/api/platform/plans', {
    cookies,
  });
  const existing = plans.find((plan) => plan.name === TEST_PLATFORM_PLAN.name);
  if (existing) return existing.id;

  const created = await apiJson<{ id: number }>('/api/platform/plans', {
    method: 'POST',
    cookies,
    body: {
      name: TEST_PLATFORM_PLAN.name,
      price: TEST_PLATFORM_PLAN.price,
      currency: TEST_PLATFORM_PLAN.currency,
      durationValue: TEST_PLATFORM_PLAN.durationValue,
      durationUnit: TEST_PLATFORM_PLAN.durationUnit,
      isActive: true,
      trialDays: TEST_PLATFORM_PLAN.trialDays,
      features: ALL_FEATURES,
    },
  });
  return created.id;
}

/**
 * Plan de plataforma + suscripción TRIAL para una organización.
 *
 * Por qué existe: sin suscripción de plataforma las features resueltas son las
 * del catálogo por defecto (solo `panel`), así que el CMS queda bloqueado y los
 * tests dependían silenciosamente de la configuración de free tier del entorno.
 * Esto hace que el tenant de pruebas sea autosuficiente y determinista.
 */
export async function seedPlatformSubscription(
  cookies: string,
  organizationId: string,
): Promise<{ planId: number; subscriptionId: number }> {
  const planId = await ensurePlatformPlan(cookies);
  const subscription = await apiJson('/api/platform/subscriptions', {
    method: 'POST',
    cookies,
    body: {
      organizationId,
      planId,
      isTrial: true,
      payment: {
        amountPaidCents: 0,
        currencyPaid: TEST_PLATFORM_PLAN.currency,
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: todayIso(TEST_ORG.timezone),
      },
    },
  });

  return { planId, subscriptionId: subscription.id };
}

// ── Gimnasio: datos mínimos y deterministas ──────────────────────────────────

export interface SeededGymIds {
  planId: number;
  memberId: number;
  memberWithoutPlanId: number;
  inactiveMemberId: number;
  subscriptionId: number;
  paymentId: number;
  classId: number;
  cmsPageId: number;
}

/**
 * Siembra el mínimo que necesitan los journeys: 1 plan, 3 clientes (con
 * suscripción vigente / sin plan / inactivo), 1 clase diaria y 1 página CMS con
 * un bloque hero.
 */
export async function seedGymData(cookies: string): Promise<SeededGymIds> {
  const tz = TEST_ORG.timezone;
  const plan = await apiJson('/api/plans', {
    method: 'POST',
    cookies,
    body: {
      name: TEST_PLAN.name,
      price: TEST_PLAN.price,
      currency: TEST_PLAN.currency,
      durationValue: TEST_PLAN.durationValue,
      durationUnit: TEST_PLAN.durationUnit,
      features: [...TEST_PLAN.features],
      isPopular: true,
      isActive: true,
      isVisibleOnSite: true,
    },
  });

  const member = await apiJson('/api/members', {
    method: 'POST',
    cookies,
    body: { ...TEST_MEMBERS.active, role: 'member', sendInvite: false },
  });
  const memberWithoutPlan = await apiJson('/api/members', {
    method: 'POST',
    cookies,
    body: { ...TEST_MEMBERS.withoutPlan, role: 'member', sendInvite: false },
  });
  const inactiveMember = await apiJson('/api/members', {
    method: 'POST',
    cookies,
    body: { ...TEST_MEMBERS.inactive, role: 'member', sendInvite: false },
  });

  const subscription = await apiJson('/api/subscriptions', {
    method: 'POST',
    cookies,
    body: {
      memberId: member.id,
      planId: plan.id,
      startDate: todayIso(tz),
      endDate: isoInDays(tz, 30),
      payment: {
        amountPaid: TEST_PLAN.price * 100,
        currencyPaid: TEST_PLAN.currency,
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: todayIso(tz),
      },
    },
  });

  const gymClass = await apiJson('/api/classes', {
    method: 'POST',
    cookies,
    body: {
      name: TEST_CLASS.name,
      trainerName: TEST_CLASS.trainerName,
      capacity: TEST_CLASS.capacity,
      startTime: TEST_CLASS.startTime,
      endTime: TEST_CLASS.endTime,
      frequencyType: TEST_CLASS.frequencyType,
      daysOfWeek: [...TEST_CLASS.daysOfWeek],
      location: TEST_CLASS.location,
      isVisible: true,
      displayOrder: 0,
    },
  });

  const cmsPage = await apiJson('/api/cms/pages', {
    method: 'POST',
    cookies,
    body: { ...TEST_CMS_PAGE },
  });
  await apiJson('/api/cms/blocks', {
    method: 'POST',
    cookies,
    body: {
      pageId: cmsPage.id,
      blockType: TEST_CMS_BLOCK.blockType,
      data: { ...TEST_CMS_BLOCK.data },
      isVisible: true,
    },
  });

  // El alta de suscripción devuelve solo la suscripción: el id del pago se
  // resuelve por el listado (mismo camino que usan los specs).
  const list = await apiJson<{ data?: Array<{ memberEmail?: string; paymentId?: number }> }>(
    '/api/subscriptions',
    { cookies, query: { limit: 50 } },
  );
  const paymentId =
    list.data?.find((row) => row.memberEmail === TEST_MEMBERS.active.email)?.paymentId ?? 0;

  return {
    planId: plan.id,
    memberId: member.id,
    memberWithoutPlanId: memberWithoutPlan.id,
    inactiveMemberId: inactiveMember.id,
    subscriptionId: subscription.id,
    paymentId,
    classId: gymClass.id,
    cmsPageId: cmsPage.id,
  };
}

export { TEST_PASSWORD };
