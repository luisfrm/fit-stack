/**
 * Global setup — lifecycle of the tenant of the normal suite.
 *
 * Flow (tests only, no evidence left behind):
 *   1. Reset: deletes the suite orgs (`e2e-suite`, `e2e-empty`) and the
 *      reserved users. If a previous run died halfway, the residue
 *      is deleted here: the worst case is "the suite orgs exist", never
 *      accumulation. The platform plan (shared catalog) is reused,
 *      it is not deleted.
 *   2. Console user (platform owner).
 *   3. The console creates the suite org (platform endpoint, as in prod).
 *   4. The console provisions the panel owner + free platform subscription + gym seed.
 *   5. Empty org `e2e-empty` for the empty-state specs (same mechanics).
 *
 * The demo org (`Fit Stack` / `fit-stack`) is NOT touched here: it is filled by
 * `pnpm seed:e2e` and never deleted.
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

  // 1) Crash-safe reset: fixed slugs and emails, always the same ones.
  //    The platform plan is not deleted (shared catalog, see db.ts).
  await wipeTenant({
    orgSlugs: SUITE_ORG_SLUGS,
    emails: RESERVED_EMAILS,
  });

  // 2) Console: platform owner (role promotion via SQL).
  const platform = await ensurePlatformTenant();

  // 3-4) Suite: org created by the console + owner + free platform plan + minimal seed.
  const suite = await ensureSuiteTenant(platform, TEST_ORG, TEST_OWNER);
  const platformBilling = await seedPlatformSubscription(platform.cookies, suite.organization.id);
  const gym = await seedGymData(suite.cookies);

  // 5) Empty org for the empty-state specs (no gym seed, but with a
  //    platform subscription so the CMS does not redirect to the dashboard).
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
