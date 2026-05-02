"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, Menu, Building2, Moon, Sun } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Text } from "@workspace/ui/components/text";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { NextImage } from "@workspace/ui/components/next/image";
import { Switch } from "@workspace/ui/components/switch";

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

export interface SidebarThemeToggle {
  isDark: boolean;
  toggle: () => void;
}

interface SidebarProps {
  user: SidebarUser;
  branding: SidebarBranding;
  navigation: SidebarNavItem[];
  footer?: React.ReactNode;
  themeToggle?: SidebarThemeToggle;
}

/**
 * Main App Sidebar for Desktop
 */
export function AppSidebar({ user, branding, navigation, footer, themeToggle }: Readonly<SidebarProps>) {
  return (
    <aside className="hidden lg:flex w-64 bg-background border-r border-border-dark flex-col py-6 shrink-0 h-svh sticky top-0 font-display">
      <SidebarContent user={user} branding={branding} navigation={navigation} footer={footer} themeToggle={themeToggle} />
    </aside>
  );
}

/**
 * Mobile Navigation with Hamburger Menu
 */
export function MobileNav({ user, branding, navigation, footer, themeToggle }: Readonly<SidebarProps>) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

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
        {themeToggle && (
          <ThemeToggleButton isDark={themeToggle.isDark} toggle={themeToggle.toggle} />
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus:outline-none">
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0 w-72 bg-background border-r-border text-foreground">
            <SheetHeader className="sr-only">
              <SheetTitle>Navegación</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full py-6">
              <SidebarContent user={user} branding={branding} navigation={navigation} footer={footer} themeToggle={themeToggle} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

const NAV_SKELETON_IDS = ["nav-sk-1", "nav-sk-2", "nav-sk-3", "nav-sk-4", "nav-sk-5"];

interface SidebarContentProps extends Omit<SidebarProps, "navigation"> {
  navigation: SidebarNavItem[];
}

/**
 * Shared sidebar content used by both Desktop Sidebar and Mobile Nav
 */
export function SidebarContent({ user, branding, navigation, footer, themeToggle }: Readonly<SidebarContentProps>) {
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
      <div className="px-6 flex-1 flex flex-col gap-8 min-h-0">
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

        {/* Navigation - Scrollable Area */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 pb-6 scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-foreground/20 transition-colors">
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
      </div>

      {/* Profile/Footer Section */}
      <div className="px-4 mt-auto pt-6">
        {themeToggle && (
          <div className="mb-4">
            <ThemeToggleButton isDark={themeToggle.isDark} toggle={themeToggle.toggle} />
          </div>
        )}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-foreground/5 border border-border min-h-[66px]">
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
          ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
          : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0 transition-colors", active ? "text-primary-foreground" : "")} />
      {label}
    </Link>
  );
}

function ThemeToggleButton({ isDark, toggle }: Readonly<{ isDark: boolean; toggle: () => void }>) {
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border bg-foreground/5 border-border hover:bg-foreground/10"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Moon className="w-5 h-5 text-primary" />
      ) : (
        <Sun className="w-5 h-5 text-yellow-500" />
      )}
      <Switch
        checked={!isDark}
        onCheckedChange={toggle}
        className="data-[state=checked]:bg-yellow-500 data-[state=unchecked]:bg-primary"
      />
    </button>
  );
}

/* ─────────────────────────────────────────────
   SETTINGS SIDEBAR (SUB-SIDEBAR)
   ───────────────────────────────────────────── */

export interface SettingsSidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
}

interface SettingsSidebarProps {
  items: SettingsSidebarItem[];
  pathname: string;
  title?: string;
}

export function SettingsSidebar({ items, pathname, title = "Ajustes del Sistema" }: Readonly<SettingsSidebarProps>) {
  return (
    <aside className="w-full lg:w-64 shrink-0">
      <div className="flex flex-col gap-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-foreground/20 transition-colors">
        <div className="px-2 pb-8">
          <Text variant="muted" size="xs" weight="bold" uppercase className="px-2 mb-4 tracking-widest opacity-60">
            {title}
          </Text>
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard/settings" && pathname.startsWith(item.href));
              const Icon = item.icon;
              const content = (
                <>
                  <Icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-foreground-dim group-hover:text-foreground-muted")} />
                  {item.label}
                </>
              );

              const className = cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border group",
                isActive
                  ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_20px_rgba(252,211,3,0.05)]"
                  : "text-foreground-muted hover:bg-foreground/5 hover:text-foreground border-transparent",
                item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-foreground-muted"
              );

              if (item.disabled) {
                return (
                  <div
                    key={item.href}
                    aria-disabled={item.disabled}
                    className={className}
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={className}
                >
                  {content}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
