"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Building2, Coins, Wallet, UserCog, CreditCard } from "lucide-react"
import { useWindowSize } from "@workspace/ui/hooks/use-window-size"
import { cn } from "@workspace/ui/lib/utils"

const SETTINGS_NAV_ITEMS = [
  { label: "General", href: "/dashboard/settings/general", icon: Building2, disabled: false },
  { label: "Organización", href: "/dashboard/settings/organization", icon: Building2, disabled: false },
  { label: "Monedas", href: "/dashboard/settings/currencies", icon: Coins, disabled: false },
  { label: "Métodos de Pago", href: "/dashboard/settings/payment-methods", icon: Wallet, disabled: false },
  { label: "Equipo", href: "/dashboard/settings/team", icon: UserCog, disabled: true },
  { label: "Facturación", href: "/dashboard/settings/billing", icon: CreditCard, disabled: true },
]

export default function SettingsRootPage() {
  const router = useRouter()
  const { width } = useWindowSize()
  const isDesktop = width !== undefined && width >= 1024 // lg breakpoint

  useEffect(() => {
    if (width !== undefined && isDesktop) {
      router.replace("/dashboard/settings/general")
    }
  }, [isDesktop, router, width])

  if (width === undefined || isDesktop) return null

  return (
    <div className="flex flex-col md:hidden animate-in fade-in slide-in-from-bottom-4 duration-500 -mx-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60 px-6 mb-4">
        Ajustes del Sistema
      </p>
      
      <div className="flex flex-col border-t border-border/80">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon
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
              <ChevronRight className="size-4 text-foreground/20" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
