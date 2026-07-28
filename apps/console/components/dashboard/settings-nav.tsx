"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Coins, Wallet, ChevronLeft } from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";
import { Button } from "@workspace/ui/components/button";

const PLATFORM_SETTINGS_NAV_ITEMS = [
  { label: "Monedas", href: "/dashboard/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/dashboard/settings/payment-methods", icon: Wallet, disabled: false },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isRoot = pathname === "/dashboard/settings";

  return (
    <>
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
            <Link href="/dashboard/settings">
              <ChevronLeft className="size-4" />
              Volver a Configuración
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
