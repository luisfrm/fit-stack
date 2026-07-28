import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SettingsMobileBack, SettingsNavTabs } from "./settings-nav";
import { cn } from "@workspace/ui/lib/utils";

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Centro de Comando"
        description="Gestiona la identidad visual, el equipo y la seguridad de tu gimnasio desde un solo lugar."
        iconName="Settings"
      />

      <SettingsNavTabs />
      <SettingsMobileBack />

      <div className={cn(
        "flex flex-col gap-8",
        "animate-in fade-in slide-in-from-right-4 duration-300"
      )}>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
