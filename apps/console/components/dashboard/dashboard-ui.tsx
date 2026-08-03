"use client";

import * as React from "react";
import { AppSidebar as UISidebar } from "@workspace/ui/components";
import { formatPlatformRole } from "@workspace/shared";
import { useTheme } from "@/lib/hooks/use-theme";
import { SidebarNav } from "@/app/dashboard/sidebar-nav";
import SignOutButton from "@/components/sign-out-button";
import type { SidebarUser } from "@workspace/ui/components";

interface AppSidebarProps {
  user: SidebarUser;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const { isDark, toggleTheme } = useTheme();

  const formattedUser = React.useMemo(
    () => ({ ...user, role: formatPlatformRole(user.role) }),
    [user],
  );

  return (
    <UISidebar
      user={formattedUser}
      branding={{
        title: "Fit Stack Console",
        subtitle: "Administración SaaS",
        fallbackIcon: undefined,
      }}
      navigation={SidebarNav}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}