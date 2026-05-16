"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Coins, Wallet, Settings, ChevronLeft } from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const PLATFORM_SETTINGS_NAV_ITEMS = [
  { label: "Monedas", href: "/dashboard/platform/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/dashboard/platform/settings/payment-methods", icon: Wallet, disabled: false },
];

export default function PlatformSettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isRoot = pathname === "/dashboard/platform/settings";

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title="Configuración de Plataforma"
        description="Monedas, métodos de pago y ajustes globales para todo el SaaS."
        iconName="Settings"
      />

      <div className="hidden lg:block">
        <NavTabs
          items={PLATFORM_SETTINGS_NAV_ITEMS}
          variant="glass"
          className="mb-8"
        />
      </div>

      {!isRoot && (
        <div className="block lg:hidden mb-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="gap-2 -ml-2 text-foreground/60 hover:text-foreground font-bold uppercase tracking-wider"
          >
            <Link href="/dashboard/platform/settings">
              <ChevronLeft className="size-4" />
              Volver a Configuración
            </Link>
          </Button>
        </div>
      )}

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