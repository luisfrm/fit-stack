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
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const SETTINGS_NAV_ITEMS: NavItem[] = [
  { label: "General", href: "/settings/general", icon: Building2, disabled: false },
  { label: "Organización", href: "/settings/organization", icon: Building2, disabled: false },
  { label: "Monedas", href: "/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/settings/payment-methods", icon: Wallet, disabled: false },
  { label: "Facturación", href: "/settings/billing", icon: CreditCard, disabled: false },
  { label: "Equipo", href: "/settings/team", icon: UserCog, disabled: true },
];

export function SettingsNavTabs() {
  return (
    <div className="hidden lg:block">
      <NavTabs
        items={SETTINGS_NAV_ITEMS}
        variant="glass"
        className="mb-8"
      />
    </div>
  );
}

export function SettingsMobileBack() {
  const pathname = usePathname();
  const isRoot = pathname === "/settings";

  if (isRoot) return null;

  return (
    <div className="block lg:hidden mb-4">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="gap-2 -ml-2 text-foreground/60 hover:text-foreground font-bold uppercase tracking-wider"
      >
        <Link href="/settings">
          <ChevronLeft className="size-4" />
          Volver al menú
        </Link>
      </Button>
    </div>
  );
}

export function SettingsMobileMenu() {
  return (
    <div className={cn("flex flex-col md:hidden animate-in fade-in slide-in-from-bottom-4 duration-500 -mx-4")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60 px-6 mb-4">
        Ajustes del Sistema
      </p>

      <div className="flex flex-col border-t border-border/80">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              className={cn(
                "flex items-center justify-between px-6 py-5 bg-surface/10 border-b border-border/80 transition-colors active:bg-primary/5",
                item.disabled && "opacity-30 pointer-events-none"
              )}
            >
              <div className="flex items-center gap-4">
                <Icon className="size-5 text-foreground/60" />
                <span className="font-bold text-xs uppercase tracking-widest text-foreground/90">
                  {item.label}
                </span>
              </div>
              <ChevronLeft className="size-4 text-foreground/20 -rotate-180" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
