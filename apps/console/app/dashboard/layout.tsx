import * as React from "react";
import { redirect } from "next/navigation";
import { sessionService } from "@workspace/auth/service";
import { GLOBAL_ROLES } from "@workspace/shared";
import { AppSidebar } from "@/components/dashboard/dashboard-ui";

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

  const userRole = await sessionService.getUserRole();
  const isAdmin = userRole === GLOBAL_ROLES.ADMIN;

  if (!isAdmin) {
    redirect("/login?status=unauthorized");
  }

  return (
    <div className="flex flex-col lg:flex-row h-svh overflow-hidden bg-background text-slate-100 font-display">
      <AppSidebar
        user={{
          name: session.user?.name || "Admin",
          role: userRole,
          avatarUrl: session.user?.image || undefined,
        }}
      />
      <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}