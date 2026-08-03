import { PLATFORM_SUBSCRIPTION_STATUSES } from "@workspace/shared";
import { api } from "@/lib/api/client";

/**
 * Server-only helper: fetches the subscription status of the active
 * organization through the ofetch API client (forwards the request cookies).
 *
 * Shared by the dashboard layout (gate) and the `/no-subscription` page
 * (which must know whether it should keep showing or bounce to the dashboard).
 */
export async function getOrgSubscriptionStatus(
  activeOrgId?: string | null,
): Promise<string> {
  if (!activeOrgId) return PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE;

  try {
    const subData = await api<{ status: string }>("/organizations/subscription-status");
    return subData.status;
  } catch (err) {
    console.error("Error fetching subscription status:", err);
  }

  return PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE;
}
