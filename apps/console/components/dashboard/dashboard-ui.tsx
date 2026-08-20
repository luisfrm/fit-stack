"use client";

import * as React from "react";
import { AppSidebar as UISidebar, Logotipo } from "@workspace/ui/components";
import { formatPlatformRole } from "@workspace/shared";
import { useTheme } from "@/lib/hooks/use-theme";
import { SidebarNav } from "@/app/dashboard/sidebar-nav";
import SignOutButton from "@/components/sign-out-button";
import type { SidebarUser, SidebarBranding } from "@workspace/ui/components";

interface AppSidebarProps {
  user: SidebarUser;
  branding?: Partial<SidebarBranding>;
}

export function AppSidebar({ user, branding }: AppSidebarProps) {
  const { isDark, toggleTheme } = useTheme();

  const formattedUser = React.useMemo(
    () => ({ ...user, role: formatPlatformRole(user.role) }),
    [user],
  );

  return (
    <UISidebar
      user={formattedUser}
      branding={{
        logotipo: <Logotipo />,
        fallbackIcon: undefined,
        ...branding,
      }}
      navigation={SidebarNav}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}