import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/dashboard/dashboard-ui";
import { sessionService } from "@/lib/services/session-service";
import { redirect } from "next/navigation";
import { OrganizationPicker } from "@/components/dashboard/organization-picker";
import { GLOBAL_ROLES } from "@workspace/shared/index";

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
    const { membersService } = await import("@/lib/services/members-service");
    const member = await membersService.getCurrentMember();
    
    if (!member) {
      // Si el miembro fue eliminado, revocamos el contexto de esa organización
      redirect("/reset-org-context");
    }
  }

  // If no active organization AND not a global admin, show the picker
  if (!activeOrgId && !isAdmin) {
    return <OrganizationPicker />;
  }

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
