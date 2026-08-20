import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";
import { OrganizationPicker } from "@/components/dashboard/organization-picker";
import { PLATFORM_SUBSCRIPTION_STATUSES, hasAccess, PERMISSION_MODULES, PERMISSION_ACTIONS, type OrgRole } from "@workspace/shared";
import { SubscriptionWarningBanner } from "@/components/dashboard/subscription/subscription-warning-banner";
import { getOrgSubscriptionStatus } from "@/lib/services/subscription-status";

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

  // Check organization subscription status
  const subscriptionStatus = await getOrgSubscriptionStatus(activeOrgId);

  // If suspended or cancelled, redirect to no-subscription page
  if (subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED ||
      subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED) {
    redirect("/no-subscription");
  }

  // Show warning banner if past_due or read_only (grace period)
  const showWarningBanner = (
    subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE ||
    subscriptionStatus === PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY
  );

  return (
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
        {children}
      </main>
    </div>
  );
}
