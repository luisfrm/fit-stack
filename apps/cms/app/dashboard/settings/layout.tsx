"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserCog,
  CreditCard,
  Building2,
  Coins,
  Wallet,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Text } from "@workspace/ui/components/text";
import { SettingsSidebar } from "@workspace/ui/components/next/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

const SETTINGS_NAV_ITEMS = [
  { label: "General", href: "/dashboard/settings", icon: Building2, disabled: false },
  { label: "Organización", href: "/dashboard/settings/organization", icon: Building2, disabled: false },
  { label: "Monedas", href: "/dashboard/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/dashboard/settings/payment-methods", icon: Wallet, disabled: false },
  { label: "Equipo", href: "/dashboard/settings/team", icon: UserCog, disabled: true },
  { label: "Facturación", href: "/dashboard/settings/billing", icon: CreditCard, disabled: true },
];

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Centro de Comando"
        description="Gestiona la identidad visual, el equipo y la seguridad de tu gimnasio desde un solo lugar."
        iconName="Settings"
      />

      <div className="flex flex-col lg:flex-row gap-12">
        <SettingsSidebar items={SETTINGS_NAV_ITEMS} pathname={pathname} />

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
