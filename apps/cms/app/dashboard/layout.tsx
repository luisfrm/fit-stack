import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/dashboard-ui";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session } = await sessionService.getSession();

  // If no session, redirect to login
  if (!session) {
    redirect("/login");
  }

  const user = session.user;
  const userRole = await sessionService.getUserRole();

  return (
    <div className="flex flex-col lg:flex-row h-svh overflow-hidden bg-background text-slate-100 font-display">
      <AppSidebar
        user={{
          name: user?.name,
          role: userRole,
          avatarUrl: user?.image || undefined,
        }}
        activeOrganizationId={session.session?.activeOrganizationId || undefined}
      />

      <MobileNav
        user={{
          name: user?.name || "Usuario",
          role: userRole,
          avatarUrl: user?.image || undefined,
        }}
        activeOrganizationId={session.session?.activeOrganizationId || undefined}
      />

      <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}
