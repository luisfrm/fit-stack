"use client";

import * as React from "react";

export type ThemeMode = "dark" | "light";

const THEME_KEY = "fitstack-theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function applyThemeToDocument(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (mode === "light") {
    html.classList.remove("dark");
    html.classList.add("light");
  } else {
    html.classList.remove("light");
    html.classList.add("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<ThemeMode>("dark");
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    applyThemeToDocument(initial);
    setIsInitialized(true);
  }, []);

  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, newTheme);
    }
    applyThemeToDocument(newTheme);
  }, []);

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  }, [theme, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === "dark",
    isInitialized,
  };
}