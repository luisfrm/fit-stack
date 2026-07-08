"use client";

import * as React from "react";
import { AppSidebar as UISidebar } from "@workspace/ui/components";
import { useTheme } from "@/lib/hooks/use-theme";
import { ConsoleSidebarNav } from "@/app/dashboard/console-sidebar-nav";
import SignOutButton from "@/components/sign-out-button";
import type { SidebarUser } from "@workspace/ui/components";

interface AppSidebarProps {
  user: SidebarUser;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <UISidebar
      user={user}
      branding={{
        title: "Fit Stack Console",
        subtitle: "Administración SaaS",
        fallbackIcon: undefined,
      }}
      navigation={ConsoleSidebarNav}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}