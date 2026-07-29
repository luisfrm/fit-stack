"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrgSettingsNav } from "@/components/dashboard/org-settings-nav";

export default function OrgSettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Ajustes de Organización"
        description="Configura la identidad, marca y personal asignado a esta sede."
        iconName="Building2"
      />

      {id && <OrgSettingsNav organizationId={id} />}

      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
