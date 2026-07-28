"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  UserCog,
  CreditCard,
  Building2,
  Coins,
  Wallet,
  ChevronLeft,
} from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const SETTINGS_NAV_ITEMS = [
  { label: "General", href: "/dashboard/settings/general", icon: Building2, disabled: false },
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
  const isRoot = pathname === "/dashboard/settings";

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Centro de Comando"
        description="Gestiona la identidad visual, el equipo y la seguridad de tu gimnasio desde un solo lugar."
        iconName="Settings"
      />

      {/* Desktop Navigation - Horizontal Tabs */}
      <div className="hidden lg:block">
        <NavTabs 
          items={SETTINGS_NAV_ITEMS} 
          variant="glass" 
          className="mb-8"
        />
      </div>

      {/* Mobile Back Button (only when in sub-routes) */}
      {!isRoot && (
        <div className="block lg:hidden mb-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="gap-2 -ml-2 text-foreground/60 hover:text-foreground font-bold uppercase tracking-wider"
          >
            <Link href="/dashboard/settings">
              <ChevronLeft className="size-4" />
              Volver al menú
            </Link>
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      <div className={cn(
        "flex flex-col gap-8",
        !isRoot && "animate-in fade-in slide-in-from-right-4 duration-300"
      )}>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
