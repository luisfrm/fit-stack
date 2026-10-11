"use client";

import { useWindowSize } from "@workspace/ui/hooks/use-window-size";

export type DeviceType = "mobile" | "tablet" | "desktop";

export function useBreakpoint() {
  const { width } = useWindowSize();

  // Standard breakpoints (can be adjusted according to design system)
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
