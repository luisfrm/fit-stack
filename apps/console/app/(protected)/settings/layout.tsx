import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SettingsNav } from "@/components/dashboard/settings-nav";

export default function PlatformSettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Configuración de Plataforma"
        description="Monedas, métodos de pago y ajustes globales para todo el SaaS."
        iconName="Settings"
      />

      <SettingsNav />

      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
