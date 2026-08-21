import { redirect } from "next/navigation";
import { sessionService } from "@/lib/services/session-service";
import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  hasAccess,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  type OrgRole,
} from "@workspace/shared";
import { getOrgSubscriptionStatus } from "@/lib/services/subscription-status";
import { getOrgFeatures } from "@/lib/services/org-features";
import { NoSubscriptionClient } from "./no-subscription-client";

export const dynamic = "force-dynamic";

export default async function NoSubscriptionPage() {
  const { data: session, error: sessionError } = await sessionService.getSession();

  if (sessionError?.code === "ORGANIZATION_NOT_FOUND") {
    redirect("/reset-org-context");
  }

  if (!session) {
    redirect("/login");
  }

  // Sin rol de acceso a panel (coach/member) → la página correcta es /unauthorized.
  const orgRole = session.member?.role as OrgRole | undefined;
  if (orgRole && !hasAccess(orgRole, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)) {
    redirect("/unauthorized");
  }

  const activeOrgId = session.session?.activeOrganizationId;

  // Free tier: la org entra al dashboard aunque no tenga suscripción pagada.
  const featuresData = await getOrgFeatures(activeOrgId);
  if (featuresData?.isFreeTier) {
    redirect("/dashboard");
  }

  const subscriptionStatus = await getOrgSubscriptionStatus(activeOrgId);

  // This page only makes sense when the org is suspended/cancelled.
  // Active or grace-period orgs belong in the dashboard.
  if (
    subscriptionStatus !== PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED &&
    subscriptionStatus !== PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED
  ) {
    redirect("/dashboard");
  }

  return <NoSubscriptionClient />;
}
