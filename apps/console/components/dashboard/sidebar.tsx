"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import {
  AppSidebar as UISidebar,
  MobileNav as UIMobileNav,
  Logotipo,
} from "@workspace/ui/components";
import { formatPlatformRole } from "@workspace/shared";
import { useTheme } from "@/lib/hooks/use-theme";
import { SidebarNav } from "@/app/(protected)/sidebar-nav";
import SignOutButton from "@/components/sign-out-button";
import type { SidebarUser, SidebarBranding } from "@workspace/ui/components";

interface ConsoleSidebarProps {
  user: SidebarUser;
  branding?: Partial<SidebarBranding>;
}

function useConsoleSidebarBranding(
  user: SidebarUser,
  branding?: Partial<SidebarBranding>,
) {
  const { isDark, toggleTheme } = useTheme();

  const formattedUser = React.useMemo(
    () => ({ ...user, role: formatPlatformRole(user.role) }),
    [user],
  );

  const resolvedBranding = React.useMemo(
    () => ({
      logotipo: <Logotipo />,
      fallbackIcon: Building2,
      ...branding,
    }),
    [branding],
  );

  return { formattedUser, resolvedBranding, isDark, toggleTheme };
}

export function AppSidebar({ user, branding }: ConsoleSidebarProps) {
  const { formattedUser, resolvedBranding, isDark, toggleTheme } =
    useConsoleSidebarBranding(user, branding);

  return (
    <UISidebar
      user={formattedUser}
      branding={resolvedBranding}
      navigation={SidebarNav}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}

export function MobileNav({ user, branding }: ConsoleSidebarProps) {
  const { formattedUser, resolvedBranding, isDark, toggleTheme } =
    useConsoleSidebarBranding(user, branding);

  return (
    <UIMobileNav
      user={formattedUser}
      branding={resolvedBranding}
      navigation={SidebarNav}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}
