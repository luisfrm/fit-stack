"use client";

import { useTheme } from "@/lib/hooks/use-theme";
import React from "react";

export function ThemeInjector() {
  const { isDark } = useTheme();

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return null;
}