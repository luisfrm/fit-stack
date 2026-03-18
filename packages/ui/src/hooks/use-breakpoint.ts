"use client";

import { useWindowSize } from "./use-window-size.js";

export type DeviceType = "mobile" | "tablet" | "desktop";

export function useBreakpoint() {
  const { width } = useWindowSize();

  // Breakpoints estándar (pueden ajustarse según el diseño)
  const isMobile = width !== undefined && width < 768;
  const isTablet = width !== undefined && width >= 768 && width < 1024;
  const isDesktop = width !== undefined && width >= 1024;

  let device: DeviceType = "desktop";
  if (isMobile) device = "mobile";
  if (isTablet) device = "tablet";

  return {
    width,
    device,
    isMobile,
    isTablet,
    isDesktop,
  };
}
