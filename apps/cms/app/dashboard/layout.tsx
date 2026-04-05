import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/dashboard-ui";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";
import { type Session } from "@/lib/auth-client";
import { getRoleName } from "@/lib/utils/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session } = await sessionService.getSession() as { data: Session | null; error: any };

  // If no session, redirect to login
  if (!session) {
    redirect("/login");
  }

  const user = session.user;

  const userRole = getRoleName(user);

  return (
    <div className="flex flex-col lg:flex-row h-svh overflow-hidden bg-background text-slate-100 font-display">
      <AppSidebar
        user={{
          name: user?.name || "Usuario",
          role: userRole,
          avatarUrl: user?.image || undefined
        }}
      />

      <MobileNav
        user={{
          name: user?.name || "Usuario",
          role: userRole,
          avatarUrl: user?.image || undefined
        }}
      />

      <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}
