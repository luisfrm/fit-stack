import * as React from "react";
import { redirect } from "next/navigation";
import { sessionService } from "@workspace/auth/service";
import { canAccessConsole } from "@workspace/shared";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { uploadService } from "@/lib/services/upload-service";

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

  if (!canAccessConsole(userRole)) {
    redirect("/unauthorized");
  }

  const [settings] = await Promise.all([
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }).catch(() => ({} as Record<string, string>)),
  ]);

  const platformLogo = settings[PLATFORM_SETTINGS_KEYS.PLATFORM_LOGO];

  return (
    <div className="flex flex-col lg:flex-row h-svh overflow-hidden bg-background text-slate-100 font-display">
      <AppSidebar
        user={{
          name: session.user?.name,
          role: userRole,
          avatarUrl: session.user?.image || undefined,
        }}
        branding={{
          logo: platformLogo ? uploadService.getMediaUrl(platformLogo) : undefined,
        }}
      />
      <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}