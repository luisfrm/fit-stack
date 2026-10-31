"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import { Logotipo } from "@workspace/ui/components";
import { AppSidebar as UISidebar, MobileNav as UIMobileNav } from "@workspace/ui/next";
import { canPlatform, formatPlatformRole } from "@workspace/shared";
import { useTheme } from "@workspace/ui/hooks/use-theme";
import { usePlatformAuth } from "@workspace/auth/platform";
import { SidebarNav } from "@/app/(protected)/sidebar-nav";
import SignOutButton from "@/components/sign-out-button";
import type {
  SidebarUser,
  SidebarBranding,
  SidebarNavItem,
} from "@workspace/ui/next";

interface ConsoleSidebarProps {
  user: SidebarUser;
  branding?: Partial<SidebarBranding>;
}

function useFilteredNavItems(): SidebarNavItem[] {
  const { platformRole } = usePlatformAuth();
  return SidebarNav.filter((item) =>
    canPlatform(platformRole, item.module, item.action),
  );
}

function useConsoleSidebarBranding(
  user: SidebarUser,
  branding?: Partial<SidebarBranding>,
) {
  const { isDark, toggleTheme } = useTheme();
  const navigation = useFilteredNavItems();

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

  return { formattedUser, resolvedBranding, navigation, isDark, toggleTheme };
}

export function AppSidebar({ user, branding }: ConsoleSidebarProps) {
  const { formattedUser, resolvedBranding, navigation, isDark, toggleTheme } =
    useConsoleSidebarBranding(user, branding);

  return (
    <UISidebar
      user={formattedUser}
      branding={resolvedBranding}
      navigation={navigation}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}

export function MobileNav({ user, branding }: ConsoleSidebarProps) {
  const { formattedUser, resolvedBranding, navigation, isDark, toggleTheme } =
    useConsoleSidebarBranding(user, branding);

  return (
    <UIMobileNav
      user={formattedUser}
      branding={resolvedBranding}
      navigation={navigation}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}
