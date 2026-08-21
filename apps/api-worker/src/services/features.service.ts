import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
  resolveFeatures,
  type PlanFeaturesV2,
} from '@workspace/shared';
import type { PlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import type { PlatformPlansRepository } from '../repositories/platform-plans.repository';
import type { PlatformSettingsRepository } from '../repositories/platform-settings.repository';
import type { FeaturesRepository } from '../repositories/features.repository';
import { getAiPeriodStarts } from '../repositories/features.repository';
import type { Cache } from '../lib/cache';

export const FREE_TIER_SETTING_KEY = 'feature_flags_free_tier';

export interface OrgFeaturesResult {
  features: PlanFeaturesV2;
  limits: Record<string, number>;
  subscriptionStatus: string;
  isFreeTier: boolean;
  planId?: string;
  planName?: string;
}

export interface QuotaUsage {
  used: number;
  limit: number;
}

export interface AiQuotaResult {
  daily: QuotaUsage;
  weekly: QuotaUsage;
  monthly: QuotaUsage;
  /** true si la feature ai_chat no está habilitada en el plan */
  disabled: boolean;
}

export interface SeatsResult {
  used: number;
  limit: number;
  pending: number;
}

/** Aplana los límites de todas las features habilitadas a un Record plano. */
function flattenLimits(features: PlanFeaturesV2): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const value of Object.values(features)) {
    if (value?.enabled && value.limits) {
      for (const [key, n] of Object.entries(value.limits)) {
        limits[key] = n;
      }
    }
  }
  return limits;
}

export function createFeaturesService(
  subsRepo: PlatformSubscriptionsRepository,
  plansRepo: PlatformPlansRepository,
  platformSettingsRepo: PlatformSettingsRepository,
  featuresRepo: FeaturesRepository,
  cache: Cache
) {
  /**
   * Features del free tier configurado en platform_setting (`feature_flags_free_tier`).
   * null = free tier NO está seteado → las orgs sin suscripción pagada quedan bloqueadas
   * (comportamiento legado: SUSPENDED/CANCELLED → /no-subscription).
   */
  async function getConfiguredFreeTier(): Promise<PlanFeaturesV2 | null> {
    const raw = await platformSettingsRepo.findByKey(FREE_TIER_SETTING_KEY);
    if (!raw) return null;
    try {
      return resolveFeatures(JSON.parse(raw) as PlanFeaturesV2);
    } catch {
      console.error('[FEATURES] Free tier setting inválido, usando defaults de código');
      return resolveFeatures(null);
    }
  }

  async function getOrgFeatures(orgId: string): Promise<OrgFeaturesResult> {
    const cacheKey = `org:${orgId}:features`;
    const cached = await cache.get<OrgFeaturesResult>(cacheKey);
    if (cached) return cached;

    const freeTier = await getConfiguredFreeTier();
    const sub = await subsRepo.findActiveByOrganization(orgId);

    let features: PlanFeaturesV2 = resolveFeatures(null);
    let subscriptionStatus: PlatformSubscriptionStatus =
      PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;
    let isFreeTier = false;
    let planId: string | undefined;
    let planName: string | undefined;

    if (sub) {
      subscriptionStatus = sub.computedStatus;
      const isActiveBilling =
        subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE ||
        subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;

      if (isActiveBilling) {
        const plan = await plansRepo.findById(sub.planId);
        features = resolveFeatures(plan?.features ?? null);
        planId = String(sub.planId);
        planName = plan?.name;
      } else if (freeTier) {
        // Suscripción vencida/suspendida + free tier seteado → piso gratuito
        features = freeTier;
        isFreeTier = true;
      }
      // sin free tier → sigue el gate legado (banner past_due/read_only, bloqueo suspended)
    } else {
      // Sin suscripción
      if (freeTier) {
        features = freeTier;
        isFreeTier = true;
      }
    }

    const data: OrgFeaturesResult = {
      features,
      limits: flattenLimits(features),
      subscriptionStatus,
      isFreeTier,
      planId,
      planName,
    };
    await cache.set(cacheKey, data, 300);
    return data;
  }

  async function getAiQuota(orgId: string, starts = getAiPeriodStarts()): Promise<AiQuotaResult> {
    const orgFeatures = await getOrgFeatures(orgId);
    const aiFeature = orgFeatures.features.ai_chat;
    const disabled = !aiFeature?.enabled;

    const limits = {
      daily: aiFeature?.limits?.ai_messages_daily ?? 0,
      weekly: aiFeature?.limits?.ai_messages_weekly ?? 0,
      monthly: aiFeature?.limits?.ai_messages_monthly ?? 0,
    };

    if (disabled) {
      return {
        daily: { used: 0, limit: 0 },
        weekly: { used: 0, limit: 0 },
        monthly: { used: 0, limit: 0 },
        disabled,
      };
    }

    const counts = await featuresRepo.getAiUsageCounts(orgId, starts);
    return {
      daily: { used: counts.daily, limit: limits.daily },
      weekly: { used: counts.weekly, limit: limits.weekly },
      monthly: { used: counts.monthly, limit: limits.monthly },
      disabled,
    };
  }

  async function getSeatsUsage(orgId: string): Promise<SeatsResult> {
    const orgFeatures = await getOrgFeatures(orgId);
    const portalFeature = orgFeatures.features.members_portal;
    const limit = portalFeature?.enabled ? (portalFeature.limits?.member_seats ?? 0) : 0;
    const used = await featuresRepo.countActivePortalUsers(orgId);
    const pending = await featuresRepo.countPendingInvitations(orgId);
    return { used, limit, pending };
  }

  return {
    getOrgFeatures,
    getAiQuota,
    getSeatsUsage,

    /**
     * Valida cuota y consume 1 mensaje de IA (upsert atómico en Postgres,
     * fuente de verdad; Redis solo como caché). Devuelve la decisión + cuotas.
     */
    async consumeAiMessage(orgId: string): Promise<{ allowed: boolean; quota: AiQuotaResult }> {
      const starts = getAiPeriodStarts();
      const quota = await getAiQuota(orgId, starts);
      if (quota.disabled) return { allowed: false, quota };

      const exhausted =
        (quota.daily.limit > 0 && quota.daily.used >= quota.daily.limit) ||
        (quota.weekly.limit > 0 && quota.weekly.used >= quota.weekly.limit) ||
        (quota.monthly.limit > 0 && quota.monthly.used >= quota.monthly.limit);

      if (exhausted) return { allowed: false, quota };
      await Promise.all([
        featuresRepo.incrementAiUsage(orgId, 'daily', starts.daily),
        featuresRepo.incrementAiUsage(orgId, 'weekly', starts.weekly),
        featuresRepo.incrementAiUsage(orgId, 'monthly', starts.monthly),
      ]);

      return {
        allowed: true,
        quota: {
          ...quota,
          daily: { used: quota.daily.used + 1, limit: quota.daily.limit },
          weekly: { used: quota.weekly.used + 1, limit: quota.weekly.limit },
          monthly: { used: quota.monthly.used + 1, limit: quota.monthly.limit },
        },
      };
    },
  };
}

export type FeaturesService = ReturnType<typeof createFeaturesService>;