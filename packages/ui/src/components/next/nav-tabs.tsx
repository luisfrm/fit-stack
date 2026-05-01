"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LucideIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const navTabsListVariants = cva(
  "inline-flex w-fit items-center justify-start gap-1 rounded-xl p-1 transition-all overflow-x-auto no-scrollbar",
  {
    variants: {
      variant: {
        glass: "bg-glass backdrop-blur-md border border-white/10",
        surface: "bg-surface border border-border",
        input: "bg-input border border-input-border",
        plain: "bg-transparent border-transparent",
      },
    },
    defaultVariants: {
      variant: "surface",
    },
  }
)

interface NavTabsProps extends VariantProps<typeof navTabsListVariants> {
  items: {
    label: string
    href: string
    icon?: LucideIcon
    disabled?: boolean
  }[]
  className?: string
  listClassName?: string
}

/**
 * Navigation Tabs for Next.js App Router.
 * Visually matches the Tabs component but uses Links for routing.
 */
export function NavTabs({
  items,
  variant,
  className,
  listClassName,
}: NavTabsProps) {
  const pathname = usePathname()

  return (
    <nav className={cn("w-full", className)}>
      <div className={cn(navTabsListVariants({ variant }), listClassName)}>
        {items.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== "/dashboard/settings" && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              className={cn(
                "relative inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200",
                "text-foreground/50 whitespace-nowrap",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md scale-[1.02] hover:bg-primary-hover" 
                  : "hover:bg-primary-glow-hover hover:text-foreground",
                item.disabled && "pointer-events-none opacity-40"
              )}
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
