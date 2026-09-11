/**
 * Global setup — ciclo de vida del tenant de la suite normal.
 *
 * Flujo (solo tests, sin evidencias al final):
 *   1. Reset: borra las orgs de la suite (`e2e-suite`, `e2e-empty`) y los
 *      usuarios reservados. Si una corrida anterior murió a medias, el residuo
 *      se borra aquí: el peor caso es "existen las orgs de la suite", nunca
 *      acumulación. El plan de plataforma (catálogo compartido) se reutiliza,
 *      no se borra.
 *   2. Usuario de consola (platform owner).
 *   3. La consola crea la org de la suite (endpoint de plataforma, como en prod).
 *   4. La consola aprovisiona el owner del panel + suscripción trial + seed gym.
 *   5. Org vacía `e2e-empty` para los specs de empty-state (misma mecánica).
 *
 * La org de demo (`Fit Stack` / `fit-stack`) NO se toca aquí: la rellena
 * `pnpm seed:e2e` y nunca se borra.
 */
import type { FullConfig } from '@playwright/test';
import { wipeTenant } from './helpers/db';
import {
  ensurePlatformTenant,
  ensureSuiteTenant,
  seedGymData,
  seedPlatformSubscription,
} from './helpers/platform';
import {
  EMPTY_ORG,
  EMPTY_OWNER,
  RESERVED_EMAILS,
  SUITE_ORG_SLUGS,
  TEST_ORG,
  TEST_OWNER,
  writeTenantState,
} from './helpers/test-tenant';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const started = Date.now();
  console.log('[e2e] reset del tenant de la suite…');

  // 1) Reset crash-safe: slugs y emails fijos, siempre los mismos.
  //    El plan de plataforma no se borra (catálogo compartido, ver db.ts).
  await wipeTenant({
    orgSlugs: SUITE_ORG_SLUGS,
    emails: RESERVED_EMAILS,
  });

  // 2) Consola: platform owner (promoción de rol por SQL).
  const platform = await ensurePlatformTenant();

  // 3-4) Suite: org creada por consola + owner + trial + seed mínimo.
  const suite = await ensureSuiteTenant(platform, TEST_ORG, TEST_OWNER);
  const platformBilling = await seedPlatformSubscription(platform.cookies, suite.organization.id);
  const gym = await seedGymData(suite.cookies);

  // 5) Org vacía para los specs de empty-state (sin seed de gimnasio, pero con
  //    suscripción de plataforma para que el CMS no redirija al dashboard).
  const empty = await ensureSuiteTenant(platform, EMPTY_ORG, EMPTY_OWNER);
  await seedPlatformSubscription(platform.cookies, empty.organization.id);

  writeTenantState({
    orgId: suite.organization.id,
    orgSlug: suite.organization.slug,
    ownerUserId: suite.userId,
    platformUserId: platform.userId,
    emptyOrgId: empty.organization.id,
    emptyOrgSlug: empty.organization.slug,
    emptyOwnerEmail: EMPTY_OWNER.email,
    ids: {
      planId: gym.planId,
      memberId: gym.memberId,
      memberWithoutPlanId: gym.memberWithoutPlanId,
      inactiveMemberId: gym.inactiveMemberId,
      subscriptionId: gym.subscriptionId,
      paymentId: gym.paymentId,
      classId: gym.classId,
      cmsPageId: gym.cmsPageId,
      platformPlanId: platformBilling.planId,
      platformSubscriptionId: platformBilling.subscriptionId,
    },
    reusedExisting: platform.existed || suite.ownerExisted || suite.orgExisted,
    createdAt: new Date().toISOString(),
  });

  console.log(`[e2e] tenant listo en ${Date.now() - started}ms (org=${TEST_ORG.slug})`);
}
