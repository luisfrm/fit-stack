import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";
import { OrganizationPicker } from "@/components/dashboard/organization-picker";
import { PLATFORM_SUBSCRIPTION_STATUSES, hasAccess, PERMISSION_MODULES, PERMISSION_ACTIONS, type OrgRole } from "@workspace/shared";
import { SubscriptionWarningBanner } from "@/components/dashboard/subscription/subscription-warning-banner";
import { FreeTierBanner } from "@/components/dashboard/free-tier-banner";
import { getOrgSubscriptionStatus } from "@/lib/services/subscription-status";
import { getOrgFeatures } from "@/lib/services/org-features";
import { OrgFeaturesProvider } from "@/components/dashboard/org-features-provider";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, error: sessionError } = await sessionService.getSession();

  if (sessionError?.code === "ORGANIZATION_NOT_FOUND") {
    redirect("/reset-org-context");
  }

  if (!session) {
    redirect("/login");
  }

  const user = session.user;
  const activeOrgId = session.session?.activeOrganizationId;

  if (!activeOrgId) {
    return <OrganizationPicker />;
  }

  const orgRole = session.member?.role as OrgRole | undefined;
  if (orgRole && !hasAccess(orgRole, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)) {
    redirect("/unauthorized");
  }

  // Check organization subscription status + features (free tier lets orgs in)
  const [featuresData, subscriptionStatus] = await Promise.all([
    getOrgFeatures(activeOrgId),
    getOrgSubscriptionStatus(activeOrgId),
  ]);

  const isFreeTier = featuresData?.isFreeTier ?? false;
  const effectiveStatus = featuresData?.subscriptionStatus ?? subscriptionStatus;

  // If suspended or cancelled (and not on free tier), redirect to no-subscription page
  if (
    !isFreeTier &&
    (effectiveStatus === PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED ||
      effectiveStatus === PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED)
  ) {
    redirect("/no-subscription");
  }

  // Show warning banner if past_due or read_only (grace period)
  const showWarningBanner = (
    !isFreeTier &&
    (effectiveStatus === PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE ||
      effectiveStatus === PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY)
  );

  return (
    <OrgFeaturesProvider
      features={featuresData?.features}
      limits={featuresData?.limits}
      isFreeTier={isFreeTier}
      subscriptionStatus={effectiveStatus}
    >
      <div className="flex flex-col lg:flex-row h-svh overflow-hidden bg-background text-slate-100 font-display">
        <AppSidebar
          user={{
            name: user?.name,
            role: session.member?.role || "member",
            avatarUrl: user?.image || undefined,
          }}
          activeOrganization={session.activeOrganization}
        />

        <MobileNav
          user={{
            name: user?.name || "Usuario",
            role: session.member?.role || "member",
            avatarUrl: user?.image || undefined,
          }}
          activeOrganization={session.activeOrganization}
        />

        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
          {showWarningBanner && <SubscriptionWarningBanner />}
          {isFreeTier && featuresData?.features && (
            <FreeTierBanner features={featuresData.features} isFreeTier={isFreeTier} className="mb-4" />
          )}
          {children}
        </main>
      </div>
    </OrgFeaturesProvider>
  );
}