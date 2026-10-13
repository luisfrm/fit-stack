/**
 * Demo seed — fills the fixed org `Fit Stack` / `fit-stack`.
 *
 * It is NOT a test: it is data filling to simulate an active org so everything
 * can be checked by hand in the panel. It runs with:
 *
 *   pnpm seed:e2e
 *
 * Rules:
 * - Idempotent: every piece is looked up by its natural identifier (org slug,
 *   member email, plan/class name, CMS page slug) and only what is missing
 *   gets created. Re-running does not duplicate. The org is NEVER deleted.
 * - Relative dates, never fixed: monthly cohorts (`monthsAgo` 5..0) with the
 *   `@workspace/shared` utilities in the org timezone, so that
 *   the 6M growth, revenue and KPIs always have shape.
 * - Everything through the real API except the members `created_at` (the API
 *   does not accept a join date: it is backdated via SQL; an exception only of
 *   the seed, the tests never touch the DB for dates).
 *
 * Requires the api-worker dev server running (`pnpm --filter api-worker dev`).
 */
import { addLocalDays, localMonthStartUtc, toLocalDayString } from '@workspace/shared';
import { API_BASE_URL, apiJson, setActiveOrganization } from './helpers/api';
import { e2eQuery } from './helpers/db';
import {
  ensurePlatformTenant,
  ensureSuiteOrganization,
  ensureSuiteTenant,
  seedPlatformSubscription,
  type OwnerDef,
  type PlatformTenant,
} from './helpers/platform';

const TZ = 'America/Caracas';

const SEED_ORG = {
  slug: 'fit-stack',
  name: 'Fit Stack',
  countryCode: 'VE',
  timezone: TZ,
  currencyFormat: 'latam',
} as const;

const SEED_OWNER: OwnerDef = {
  email: 'owner@fit-stack.test',
  password: 'FitStack123!',
  name: 'Fit Stack Owner',
  firstName: 'Fit',
  lastName: 'Stack',
};

const SEED_PLANS = [
  { name: 'Plan Seed Mensual', price: 50, currency: 'USD', durationValue: 1, durationUnit: 'month', isPopular: true },
  { name: 'Plan Seed Trimestral', price: 130, currency: 'USD', durationValue: 3, durationUnit: 'month', isPopular: false },
  { name: 'Plan Seed Anual', price: 480, currency: 'USD', durationValue: 1, durationUnit: 'year', isPopular: false },
  { name: 'Plan Seed Diario', price: 5, currency: 'USD', durationValue: 1, durationUnit: 'day', isPopular: false },
] as const;

// 30 deterministic names (5 per cohort × 6 months).
const SEED_NAMES: Array<[string, string]> = [
  ['Lucía', 'Fernández'], ['Miguel', 'Torres'], ['Sofía', 'Ramírez'], ['Diego', 'Morales'], ['Valentina', 'Castillo'],
  ['Andrés', 'Vargas'], ['Camila', 'Rojas'], ['Javier', 'Silva'], ['Mariana', 'Navarro'], ['Carlos', 'Mendoza'],
  ['Daniela', 'Aguilar'], ['Pedro', 'Delgado'], ['Alejandra', 'Guerrero'], ['Rafael', 'Medina'], ['Gabriela', 'Herrera'],
  ['Emilio', 'Cruz'], ['Fernanda', 'Ortiz'], ['Hugo', 'Reyes'], ['Paola', 'Jiménez'], ['Raúl', 'Torres'],
  ['Elena', 'Vega'], ['Marcos', 'Campos'], ['Teresa', 'Luna'], ['Iván', 'Salazar'], ['Clara', 'Domínguez'],
  ['Nicolás', 'Paredes'], ['Adriana', 'Soto'], ['Felipe', 'Contreras'], ['Rosa', 'Bravo'], ['Tomás', 'Fuentes'],
];

const SEED_CLASSES = [
  {
    name: 'Crossfit Seed',
    trainerName: 'Coach Seed',
    capacity: 20,
    startTime: '18:00',
    endTime: '19:00',
    frequencyType: 'weekly',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    location: 'Sala principal',
  },
  {
    name: 'Yoga Seed',
    trainerName: 'Coach Seed',
    capacity: 15,
    startTime: '07:00',
    endTime: '08:00',
    frequencyType: 'weekly',
    daysOfWeek: [1, 3, 5],
    location: 'Sala zen',
  },
  {
    name: 'Spinning Seed',
    trainerName: 'Coach Seed',
    capacity: 12,
    startTime: '19:00',
    endTime: '20:00',
    frequencyType: 'weekly',
    daysOfWeek: [2, 4],
    location: 'Sala cardio',
  },
] as const;

const SEED_PAGES = [
  { title: 'Inicio', slug: 'inicio', description: 'Página principal del gimnasio demo' },
  { title: 'Planes', slug: 'planes', description: 'Catálogo de planes del gimnasio demo' },
  { title: 'Contacto', slug: 'contacto', description: 'Contacto del gimnasio demo' },
] as const;

interface Counter {
  created: number;
  reused: number;
}

function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

async function assertApiAlive(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/healthz`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch {
    throw new Error(
      `No se pudo contactar al api-worker en ${API_BASE_URL}. Levántalo con: pnpm --filter api-worker dev`,
    );
  }
}

/** Day 15 of the `monthsAgo` month in the org tz (for historical payments). */
function monthDay(tz: string, monthsAgo: number, day: number): string {
  const monthStart = toLocalDayString(tz, localMonthStartUtc(tz, monthsAgo));
  return addLocalDays(tz, monthStart, day - 1);
}

async function ensurePlans(cookies: string): Promise<{ ids: number[]; counter: Counter }> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<{ id: number; name: string }>(
    await apiJson('/api/plans', { cookies, query: { limit: 100 } }),
  );
  const ids: number[] = [];
  for (const plan of SEED_PLANS) {
    const found = existing.find((row) => row.name === plan.name);
    if (found) {
      ids.push(found.id);
      counter.reused += 1;
      continue;
    }
    const created = await apiJson<{ id: number }>('/api/plans', {
      method: 'POST',
      cookies,
      body: { ...plan, features: ['Acceso completo'], isActive: true, isVisibleOnSite: true },
    });
    ids.push(created.id);
    counter.created += 1;
  }
  return { ids, counter };
}

interface SeededMember {
  id: number;
  email: string;
  monthsAgo: number;
}

/**
 * 5 members per monthly cohort (4 active + 1 inactive), with `created_at`
 * backdated to day 1 of their month. No portal: linking `userId` requires the
 * invitation flow (token), out of the scope of seed v1.
 */
async function ensureMembers(
  cookies: string,
  orgId: string,
): Promise<{ members: SeededMember[]; counter: Counter }> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<{ id: number; email: string }>(
    await apiJson('/api/members', { cookies, query: { limit: 100 } }),
  );
  const byEmail = new Map(existing.map((row) => [row.email, row.id]));
  const members: SeededMember[] = [];

  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
    const cohortIds: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const idx = (5 - monthsAgo) * 5 + i;
      const [firstName, lastName] = SEED_NAMES[idx]!;
      const email = `seed-m${monthsAgo}-${i}@fit-stack.test`;
      const known = byEmail.get(email);
      if (known !== undefined) {
        members.push({ id: known, email, monthsAgo });
        counter.reused += 1;
        continue;
      }
      const created = await apiJson<{ id: number }>('/api/members', {
        method: 'POST',
        cookies,
        body: {
          firstName,
          lastName: `${lastName} Seed`,
          email,
          role: 'member',
          isActive: i < 4,
          sendInvite: false,
        },
      });
      byEmail.set(email, created.id);
      cohortIds.push(created.id);
      members.push({ id: created.id, email, monthsAgo });
      counter.created += 1;
    }
    // Backdates only the newly created members of the cohort to day 1 of their month.
    if (cohortIds.length > 0) {
      const at = localMonthStartUtc(TZ, monthsAgo);
      await e2eQuery(
        `UPDATE gym_member SET created_at = $1, updated_at = $1 WHERE id = ANY($2::bigint[]) AND organization_id = $3`,
        [at.toISOString(), cohortIds, orgId],
      );
    }
  }

  // Upcoming birthdays (always within 7 days, fixed year 1990): feeds the
  // birthday widget on any run date.
  const today = toLocalDayString(TZ);
  const targets = members.slice(0, 4);
  for (let k = 0; k < targets.length; k += 1) {
    const mmdd = addLocalDays(TZ, today, k + 1).slice(5);
    await e2eQuery(
      `UPDATE gym_member SET birthday = $1 WHERE id = $2 AND organization_id = $3`,
      [`1990-${mmdd}`, targets[k]!.id, orgId],
    );
  }

  return { members, counter };
}

async function ensureSubscriptions(
  cookies: string,
  members: SeededMember[],
  monthlyPlanId: number,
): Promise<Counter> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<{ memberEmail?: string; memberId?: number }>(
    await apiJson('/api/subscriptions', { cookies, query: { limit: 100 } }),
  );
  const withSub = new Set(
    existing.map((row) => row.memberEmail).filter((email): email is string => Boolean(email)),
  );

  let processingLeft = 3;
  for (let pos = 0; pos < members.length; pos += 1) {
    const member = members[pos]!;
    // The 5th of each cohort (inactive) is left without a subscription on purpose
    // to feed the "sin plan" KPI.
    if (pos % 5 === 4) continue;
    if (withSub.has(member.email)) {
      counter.reused += 1;
      continue;
    }
    // Current cohort (month 0): mix of validated + processing (actionable).
    // Old cohorts: historical validated ones (expired or current depending on the month).
    const status = member.monthsAgo === 0 && processingLeft > 0 ? 'processing' : 'validated';
    if (status === 'processing') processingLeft -= 1;

    const payDate = monthDay(TZ, member.monthsAgo, 15);
    await apiJson('/api/subscriptions', {
      method: 'POST',
      cookies,
      body: {
        memberId: member.id,
        planId: monthlyPlanId,
        startDate: payDate,
        endDate: addLocalDays(TZ, payDate, 30),
        payment: {
          amountPaid: 5000,
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status,
          paymentDate: payDate,
        },
      },
    });
    counter.created += 1;
  }
  return counter;
}

async function ensureClasses(cookies: string): Promise<Counter> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<{ id: number; name: string }>(
    await apiJson('/api/classes', { cookies, query: { limit: 100 } }),
  );
  for (const cls of SEED_CLASSES) {
    if (existing.some((row) => row.name === cls.name)) {
      counter.reused += 1;
      continue;
    }
    await apiJson('/api/classes', {
      method: 'POST',
      cookies,
      body: { ...cls, daysOfWeek: [...cls.daysOfWeek], isVisible: true, displayOrder: 0 },
    });
    counter.created += 1;
  }
  return counter;
}

async function ensureCms(cookies: string): Promise<Counter> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<{ id: number; slug: string }>(await apiJson('/api/cms/pages', { cookies }));
  for (const page of SEED_PAGES) {
    const found = existing.find((row) => row.slug === page.slug);
    if (found) {
      counter.reused += 1;
      continue;
    }
    const created = await apiJson<{ id: number }>('/api/cms/pages', {
      method: 'POST',
      cookies,
      body: { ...page, metaTitle: page.title, metaDescription: page.description, isActive: true },
    });
    await apiJson('/api/cms/blocks', {
      method: 'POST',
      cookies,
      body: {
        pageId: created.id,
        blockType: 'hero',
        data: { title: `Bienvenido — ${page.title}`, subtitle: 'Contenido demo del seed', ctaText: 'Ver planes' },
        isVisible: true,
      },
    });
    counter.created += 1;
  }
  return counter;
}

async function ensureOrgSubscription(platform: PlatformTenant, orgId: string): Promise<Counter> {
  const counter: Counter = { created: 0, reused: 0 };
  const existing = asArray<unknown>(
    await apiJson(`/api/platform/organizations/${orgId}/subscriptions`, {
      cookies: platform.cookies,
    }),
  );
  if (existing.length > 0) {
    counter.reused = existing.length;
    return counter;
  }
  await seedPlatformSubscription(platform.cookies, orgId);
  counter.created = 1;
  return counter;
}

function line(label: string, counter: Counter): void {
  console.log(`  ${label}: ${counter.created} creados, ${counter.reused} reutilizados`);
}

async function main(): Promise<void> {
  await assertApiAlive();

  // 1) Console + fixed org (created if it does not exist, filled if it does).
  const platform = await ensurePlatformTenant();
  const suite = await ensureSuiteTenant(platform, SEED_ORG, SEED_OWNER);
  await setActiveOrganization(suite.cookies, suite.organization.id);
  console.log(`[seed] org "${SEED_ORG.slug}" lista (id=${suite.organization.id})`);

  // 2) Platform subscription for full features.
  line('suscripción plataforma', await ensureOrgSubscription(platform, suite.organization.id));

  // 3) Catalog + members per cohort + subscriptions + classes + CMS.
  const { ids: planIds, counter: plansCounter } = await ensurePlans(suite.cookies);
  line('planes', plansCounter);

  const { members, counter: membersCounter } = await ensureMembers(suite.cookies, suite.organization.id);
  line('miembros', membersCounter);

  line('suscripciones', await ensureSubscriptions(suite.cookies, members, planIds[0]!));
  line('clases', await ensureClasses(suite.cookies));
  line('páginas CMS', await ensureCms(suite.cookies));

  console.log(`[seed] listo. Panel: http://localhost:3001 — login ${SEED_OWNER.email} / ${SEED_OWNER.password}`);
}

main().catch((err) => {
  console.error('[seed] falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
