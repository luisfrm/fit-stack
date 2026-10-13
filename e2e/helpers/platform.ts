/**
 * Provisioning of the tenant of the suite (only the global-setup and the
 * login setups use it; the specs consume `fixtures.ts`).
 *
 * Normal suite flow: console user → creates the org via the platform
 * endpoint (the same path as the console) → provisions the panel owner
 * → seeds. All with fixed identities and check-then-create where applicable.
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

/** Minimal org definition accepted by the ensure helpers (suite and seed). */
export interface OrgDef {
  slug: string;
  name: string;
  countryCode: string;
  timezone: string;
  currencyFormat: string;
}

/** Minimal owner definition accepted by the ensure helpers (suite and seed). */
export interface OwnerDef {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}

/** Full features for the platform plan of the test tenant. */
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

/** Login if the user exists, sign-up if not. Returns session cookies. */
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
    // The user does not exist yet — it is created below.
  }

  const created = await registerUser({
    email: user.email,
    password: user.password,
    name: user.name,
  });
  const cookies = await signIn(user.email, user.password);
  return { userId: created.userId, cookies, existed: false };
}

// ── Console: platform owner ──────────────────────────────────────────────────

export interface PlatformTenant {
  userId: string;
  cookies: string;
  existed: boolean;
}

/**
 * Ensures the platform owner of the console. Role promotion is done via
 * SQL (the admin plugin endpoint requires a pre-existing admin) and is re-applied
 * every time, so it also works when the user comes from the environment.
 */
export async function ensurePlatformTenant(): Promise<PlatformTenant> {
  const { userId, cookies, existed } = await signInOrRegister(TEST_PLATFORM);
  await setUserPlatformRole(userId, 'owner');
  return { userId, cookies, existed };
}

// ── Suite: console-created org + panel owner ─────────────────────────────────

export interface SuiteTenant {
  userId: string;
  cookies: string;
  organization: TestOrganization;
  orgExisted: boolean;
  ownerExisted: boolean;
}

/**
 * Creates the organization through the platform endpoint
 * (`POST /api/platform/organizations`), the way the console would.
 * Idempotent by slug: if the org already exists it is reused.
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
 * Provisions the panel owner in an org created by the console
 * (`POST /api/platform/organizations/:id/staff` with role owner): creates the
 * `gym_member` and links the existing user as an `auth_member` owner.
 * Idempotent: if the user is already a member of the org it does nothing.
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
 * Full tenant of the suite: console → org → panel owner with the active
 * org. It is the real flow (the org is born from the console, not via Better Auth
 * directly).
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

// ── SaaS platform: plan + trial subscription for the org ─────────────────────

/**
 * Ensures the platform plan used by the tests.
 *
 * It is idempotent: it REUSES it if it already exists by name, because `platform_plan`
 * is catalog (it does not hang from the organization and is not deleted with it).
 * Without this, every run would leave a new plan in the console listing.
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
 * Platform plan + TRIAL subscription for an organization.
 *
 * Why it exists: without a platform subscription the resolved features are the
 * default catalog ones (only `panel`), so the CMS stays blocked and the
 * tests silently depended on the free tier configuration of the environment.
 * This makes the test tenant self-sufficient and deterministic.
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

// ── Gym: minimal, deterministic data ─────────────────────────────────────────

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
 * Seeds the minimum the journeys need: 1 plan, 3 clients (with a
 * current subscription / no plan / inactive), 1 daily class and 1 CMS page with
 * a hero block.
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

  // The subscription creation returns only the subscription: the payment id is
  // resolved from the listing (the same path the specs use).
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
