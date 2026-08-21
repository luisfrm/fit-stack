import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { PlanFeaturesV2 } from "@workspace/shared";
import type { AiUsage } from "@/lib/features/quota";

export interface OrgFeaturesResponse {
  features: PlanFeaturesV2;
  limits: Record<string, number>;
  subscriptionStatus: string;
  isFreeTier: boolean;
  planId?: string;
  planName?: string;
}

export interface OrgSeatsResponse {
  used: number;
  limit: number;
  pending: number;
}

/**
 * Server-only helpers: fetches org features, AI usage and portal seats
 * through the ofetch API client (forwards the request cookies).
 */
export async function getOrgFeatures(
  activeOrgId?: string | null,
  options?: ApiFetchOptions,
): Promise<OrgFeaturesResponse | null> {
  if (!activeOrgId) return null;
  try {
    return await api<OrgFeaturesResponse>("/organizations/features", options);
  } catch (err) {
    console.error("Error fetching org features:", err);
    return null;
  }
}

export async function getAiUsage(options?: ApiFetchOptions): Promise<AiUsage | null> {
  try {
    return await api<AiUsage>("/ai/usage", options);
  } catch (err) {
    console.error("Error fetching AI usage:", err);
    return null;
  }
}

export async function getOrgSeats(options?: ApiFetchOptions): Promise<OrgSeatsResponse | null> {
  try {
    return await api<OrgSeatsResponse>("/organizations/seats", options);
  } catch (err) {
    console.error("Error fetching org seats:", err);
    return null;
  }
}