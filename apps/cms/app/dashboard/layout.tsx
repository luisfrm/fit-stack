import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/dashboard-ui";
import { sessionService } from "@/lib/session-service";
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

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-background text-slate-100 font-display">
      <AppSidebar 
        user={{ 
          name: user?.name || "Usuario", 
          role: (user as any)?.role || "Administrador",
          avatarUrl: user?.image || undefined
        }} 
      />
      
      <MobileNav 
        user={{ 
          name: user?.name || "Usuario", 
          role: (user as any)?.role || "Administrador",
          avatarUrl: user?.image || undefined
        }} 
      />

      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}
