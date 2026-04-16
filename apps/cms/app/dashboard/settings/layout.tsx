"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserCog,
  ShieldCheck,
  CreditCard,
  Building2,
  Coins,
  Wallet,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Text } from "@workspace/ui/components/text";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

const SETTINGS_NAV_ITEMS = [
  { label: "General", href: "/dashboard/settings", icon: Building2, disabled: false },
  { label: "Organización", href: "/dashboard/settings/organization", icon: Building2, disabled: false },
  { label: "Monedas", href: "/dashboard/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/dashboard/settings/payment-methods", icon: Wallet, disabled: false },
  { label: "Roles y Permisos", href: "/dashboard/settings/roles", icon: ShieldCheck, disabled: false },
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
        {/* Settings Sub-Sidebar */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="flex flex-col gap-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
            <div className="px-2 pb-8">
              <Text variant="muted" size="xs" weight="bold" uppercase className="px-2 mb-4 tracking-widest opacity-60">
                Ajustes del Sistema
              </Text>
              <nav className="flex flex-col gap-1">
                {SETTINGS_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard/settings" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  const Tag = item.disabled ? "div" : Link;
                  return (
                    <Tag
                      key={item.href}
                      href={item.href}
                      aria-disabled={item.disabled}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border group",
                        isActive
                          ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_20px_rgba(252,211,3,0.05)]"
                          : "text-slate-400 hover:bg-foreground/10 hover:text-slate-100 border-transparent",
                        item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-slate-400"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300")} />
                      {item.label}
                    </Tag>
                  );
                })}
              </nav>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
