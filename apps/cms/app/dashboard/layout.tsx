import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/dashboard-ui";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";
import { OrganizationPicker } from "@/components/dashboard/organization-picker";
import { GLOBAL_ROLES, PLATFORM_SUBSCRIPTION_STATUSES } from "@workspace/shared/index";
import { SubscriptionWarningBanner } from "@/components/dashboard/subscription/subscription-warning-banner";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, error: sessionError } = await sessionService.getSession();

  // Si la organización en sesión no existe (fue eliminada), limpiamos el contexto
  if (sessionError?.code === "ORGANIZATION_NOT_FOUND") {
    redirect("/reset-org-context");
  }

  // If no session, redirect to login
  if (!session) {
    redirect("/login");
  }

  const user = session.user;
  const userRole = await sessionService.getUserRole();
  const isAdmin = userRole === GLOBAL_ROLES.ADMIN;

  const activeOrgId = session.session?.activeOrganizationId;

  // 🛡️ Seguridad: Si no es admin y tiene una org activa, verificamos que su gymMember aún exista
  // Esto evita que usuarios eliminados de una sede sigan navegando en ella
  if (!isAdmin && activeOrgId) {
    const { headers: nextHeaders } = await import("next/headers");
    const cookieHeader = (await nextHeaders()).get("cookie") || "";
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    try {
      const res = await fetch(`${apiBase}/api/members/me`, {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      });

      if (res.status === 404) {
        // gymMember fue eliminado → revocar contexto
        redirect("/reset-org-context");
      }
    } catch (err) {
      console.error("Error verifying membership in layout:", err);
    }
  }

  // If no active organization, show the picker
  if (!activeOrgId) {
    return <OrganizationPicker />;
  }

  // Check organization subscription status
  let subscriptionStatus: string = PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE;
  if (activeOrgId) {
    try {
      const { headers: nextHeaders } = await import("next/headers");
      const cookieHeader = (await nextHeaders()).get("cookie") || "";
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

      const subRes = await fetch(`${apiBase}/api/organizations/subscription-status`, {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        subscriptionStatus = subData.status;
      }
    } catch (err) {
      console.error("Error fetching subscription status:", err);
    }
  }

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
          role: session.member?.role || userRole,
          avatarUrl: user?.image || undefined,
        }}
        activeOrganizationId={session.session?.activeOrganizationId || undefined}
      />

      <MobileNav
        user={{
          name: user?.name || "Usuario",
          role: session.member?.role || userRole,
          avatarUrl: user?.image || undefined,
        }}
        activeOrganizationId={session.session?.activeOrganizationId || undefined}
      />

      <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
        {showWarningBanner && <SubscriptionWarningBanner />}
        {children}
      </main>
    </div>
  );
}
