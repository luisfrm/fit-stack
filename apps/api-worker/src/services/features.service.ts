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
import { startOfMonthUtc, startOfSubscriptionPeriod } from '../repositories/features.repository';
import type { Cache } from '../lib/cache';

export const FREE_TIER_SETTING_KEY = 'feature_flags_free_tier';
export const FREE_TIER_ENABLED_KEY = 'feature_flags_free_tier_enabled';
export const AI_PROVIDER_DEFAULT_KEY = 'ai_provider_default';

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
  monthly: QuotaUsage;
  /** null = ilimitado (limit 0). JSON-safe (Infinity → null). */
  remaining: number | null;
  /** true si la feature ai_chat no está habilitada en el plan */
  disabled: boolean;
  periodStart: Date;
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
   * null = free tier NO habilitado → legacy gate.
   */
  async function getConfiguredFreeTier(): Promise<PlanFeaturesV2 | null> {
    const enabled = await platformSettingsRepo.findByKey(FREE_TIER_ENABLED_KEY);
    if (enabled !== 'true') return null;
    const raw = await platformSettingsRepo.findByKey(FREE_TIER_SETTING_KEY);
    if (!raw) return resolveFeatures(null);
    try {
      return resolveFeatures(JSON.parse(raw) as PlanFeaturesV2);
    } catch {
      console.error('[FEATURES] Free tier setting inválido, usando defaults de código');
      return resolveFeatures(null);
    }
  }

  /** Periodo mensual: ciclo de suscripción si hay sub activa, si no calendario. */
  async function getCreditPeriodStart(orgId: string): Promise<Date> {
    const sub = await subsRepo.findActiveByOrganization(orgId);
    if (sub) {
      const status = sub.computedStatus;
      const isActiveBilling =
        status === PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE ||
        status === PLATFORM_SUBSCRIPTION_STATUSES.TRIAL;
      if (isActiveBilling) {
        const plan = await plansRepo.findById(sub.planId);
        // Si el plan no existe, fallback a mes calendario
        if (plan) {
          return startOfSubscriptionPeriod(
            sub.currentPeriodEnd as unknown as Date,
            plan.durationValue,
            plan.durationUnit,
          );
        }
      }
    }
    return startOfMonthUtc(new Date());
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
        features = freeTier;
        isFreeTier = true;
      }
    } else {
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

  async function getAiQuota(orgId: string): Promise<AiQuotaResult> {
    const orgFeatures = await getOrgFeatures(orgId);
    const aiFeature = orgFeatures.features.ai_chat;
    const disabled = !aiFeature?.enabled;

    const limit = aiFeature?.limits?.ai_credits_monthly ?? 0;

    if (disabled) {
      const periodStart = await getCreditPeriodStart(orgId);
      return { monthly: { used: 0, limit: 0 }, remaining: 0, disabled, periodStart };
    }

    const periodStart = await getCreditPeriodStart(orgId);
    const used = await featuresRepo.getMonthlyCredits(orgId, periodStart);
    const remaining = limit === 0 ? null : Math.max(0, limit - used);
    return { monthly: { used, limit }, remaining, disabled, periodStart };
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
    getCreditPeriodStart,

    /** Estima créditos por request (chars/4 + maxTokens). Mínimo 1. */
    estimateCredits(messages: { content: string }[], maxTokens: number): number {
      const chars = messages.reduce((acc, m) => acc + m.content.length, 0);
      const tokens = Math.ceil(chars / 4) + maxTokens;
      return Math.max(1, Math.ceil(tokens / 1_000));
    },

    async consumeAiCredits(
      orgId: string,
      estimatedCredits: number,
    ): Promise<{ allowed: boolean; quota: AiQuotaResult }> {
      const quota = await getAiQuota(orgId);
      if (quota.disabled) return { allowed: false, quota };
      if (quota.monthly.limit > 0 && quota.monthly.used + estimatedCredits > quota.monthly.limit) {
        return { allowed: false, quota };
      }
      // No consume todavía: se descuenta en settleAiCredits post-stream
      return { allowed: true, quota };
    },

    async settleAiCredits(orgId: string, periodStart: Date, actualCredits: number): Promise<AiQuotaResult> {
      const quota = await getAiQuota(orgId);
      if (quota.disabled || actualCredits <= 0) return quota;
      const limit = quota.monthly.limit;
      await featuresRepo.incrementCredits(orgId, periodStart, actualCredits);
      // Si excede (race), el próximo request quedará en 429; no hacemos rollback mid-stream
      const used = quota.monthly.used + actualCredits;
      return {
        monthly: { used, limit },
        remaining: limit === 0 ? null : Math.max(0, limit - used),
        disabled: false,
        periodStart,
      };
    },

    // Compat: mensajes → créditos (1 mensaje ≈ 3 créditos para tests viejos)
    async consumeAiMessage(orgId: string): Promise<{ allowed: boolean; quota: AiQuotaResult }> {
      const quota = await getAiQuota(orgId);
      if (quota.disabled) return { allowed: false, quota };
      if (quota.monthly.limit > 0 && quota.monthly.used + 3 > quota.monthly.limit) {
        return { allowed: false, quota };
      }
      const periodStart = quota.periodStart;
      await featuresRepo.incrementCredits(orgId, periodStart, 3);
      const used = quota.monthly.used + 3;
      return {
        allowed: true,
        quota: {
          monthly: { used, limit: quota.monthly.limit },
          remaining: quota.monthly.limit === 0 ? null : Math.max(0, quota.monthly.limit - used),
          disabled: false,
          periodStart,
        },
      };
    },
  };
}

export type FeaturesService = ReturnType<typeof createFeaturesService>;
