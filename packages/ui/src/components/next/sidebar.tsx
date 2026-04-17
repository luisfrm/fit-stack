"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, Menu, Building2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Text } from "@workspace/ui/components/text";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { NextImage } from "@workspace/ui/components/next/image";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface SidebarUser {
  name: string;
  role: string;
  avatarUrl?: string;
}

export interface SidebarBranding {
  logo?: string;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  fallbackIcon?: LucideIcon;
  action?: React.ReactNode;
}

interface SidebarProps {
  user: SidebarUser;
  branding: SidebarBranding;
  navigation: SidebarNavItem[];
  footer?: React.ReactNode;
}

/**
 * Main App Sidebar for Desktop
 */
export function AppSidebar({ user, branding, navigation, footer }: Readonly<SidebarProps>) {
  return (
    <aside className="hidden lg:flex w-64 bg-background border-r border-border-dark flex-col justify-between py-6 shrink-0 h-svh sticky top-0 font-display">
      <SidebarContent user={user} branding={branding} navigation={navigation} footer={footer} />
    </aside>
  );
}

/**
 * Mobile Navigation with Hamburger Menu
 */
export function MobileNav({ user, branding, navigation, footer }: Readonly<SidebarProps>) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close sheet on route change
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const FallbackIcon = branding.fallbackIcon;

  const LogoContent = branding.logo ? (
    <NextImage src={branding.logo} alt="Logo" width={32} height={32} />
  ) : (
    <div className="text-primary w-4 h-4">
      {FallbackIcon ? <FallbackIcon className="w-full h-full" /> : <Building2 className="w-full h-full" />}
    </div>
  );

  return (
    <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border-dark bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between font-display">
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden transition-colors duration-300",
          branding.isLoading ? "bg-white/5 border-white/5" : "bg-primary/10 border-primary/20"
        )}>
          {branding.isLoading ? <Skeleton className="w-full h-full rounded-none" /> : LogoContent}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <Link href="/dashboard" className="transition-opacity hover:opacity-80">
            {branding.isLoading ? (
              <Skeleton className="h-5 w-24 rounded-md" />
            ) : (
              <Text as="p" size="sm" weight="bold" className="leading-none uppercase italic tracking-tighter">
                {branding.title || "Panel"}
              </Text>
            )}
          </Link>
          {!branding.isLoading && branding.action && <div>{branding.action}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer focus:outline-none">
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0 w-72 bg-background border-r-border-dark text-slate-100">
            <SheetHeader className="sr-only">
              <SheetTitle>Navegación</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full py-6">
              <SidebarContent user={user} branding={branding} navigation={navigation} footer={footer} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

const NAV_SKELETON_IDS = ["nav-sk-1", "nav-sk-2", "nav-sk-3", "nav-sk-4", "nav-sk-5"];

/**
 * Shared sidebar content used by both Desktop Sidebar and Mobile Nav
 */
export function SidebarContent({ user, branding, navigation, footer }: Readonly<SidebarProps>) {
  const pathname = usePathname();

  const DesktopFallbackIcon = branding.fallbackIcon;

  const DesktopLogoContent = branding.logo ? (
    <NextImage src={branding.logo} alt="Logo" width={40} height={40} />
  ) : (
    <div className="text-primary w-5 h-5">
      {DesktopFallbackIcon ? <DesktopFallbackIcon className="w-full h-full" /> : <Building2 className="w-full h-full" />}
    </div>
  );

  return (
    <>
      <div className="px-6 flex flex-col gap-8 h-full">
        {/* Branding Branding */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden shadow-lg transition-colors duration-300",
              branding.isLoading ? "bg-white/5 border-white/5 shadow-none" : "bg-primary/10 border-primary/20 shadow-primary/5"
            )}>
              {branding.isLoading ? <Skeleton className="w-full h-full rounded-none" /> : DesktopLogoContent}
            </div>
            <div className="flex flex-col min-w-0">
              {branding.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-3 w-20 rounded-md" />
                </div>
              ) : (
                <>
                  <Link href="/dashboard" className="transition-opacity hover:opacity-80">
                    <Text as="p" size="md" weight="bold" className="leading-tight truncate uppercase italic tracking-tighter">
                      {branding.title || "Panel"}
                    </Text>
                  </Link>
                  <Text as="span" size="xs" variant="subtle" className="truncate opacity-60">
                    {branding.subtitle || "Admin"}
                  </Text>
                </>
              )}
            </div>
          </div>
          {!branding.isLoading && branding.action && <div>{branding.action}</div>}
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {branding.isLoading ? (
            <>
              {NAV_SKELETON_IDS.map((id) => (
                <div key={id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-foreground/5 animate-pulse">
                  <div className="w-5 h-5 rounded bg-foreground/10 shrink-0" />
                  <div className="h-4 bg-foreground/10 rounded w-2/3" />
                </div>
              ))}
            </>
          ) : (
            navigation.map((item) => {
              const isActive = item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <SidebarNavItem
                  key={item.href}
                  {...item}
                  active={isActive}
                />
              );
            })
          )}
        </nav>
      </div>

      {/* Profile/Footer Section */}
      <div className="px-4 mt-auto">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 min-h-[66px]">
          {branding.isLoading ? (
            <>
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-primary/10">
                {user.avatarUrl ? (
                  <NextImage src={user.avatarUrl} alt={user.name} width={40} height={40} />
                ) : (
                  <span className="text-sm font-bold text-primary">{user.name.charAt(0)}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <Text as="span" size="base" weight="semibold" truncate>
                  {user.name}
                </Text>
                <Text as="span" size="xs" variant="subtle" truncate>
                  {user.role}
                </Text>
              </div>
              {footer}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SidebarNavItem({ label, href, icon: Icon, active }: Readonly<SidebarNavItem & { active?: boolean }>) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
        active
          ? "bg-primary text-black font-bold shadow-lg shadow-primary/20"
          : "text-slate-400 hover:bg-foreground/10 hover:text-slate-100"
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0 transition-colors", active ? "text-black" : "group-hover:text-slate-200")} />
      {label}
    </Link>
  );
}
