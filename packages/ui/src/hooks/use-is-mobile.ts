"use client";

import { useBreakpoint } from "@workspace/ui/hooks/use-breakpoint";

/**
 * `true` cuando el viewport es menor al breakpoint `md` (< 768px).
 * Derivado del hook compartido `useBreakpoint` (fuente única de breakpoints).
 */
export function useIsMobile() {
  const { isMobile } = useBreakpoint();
  return isMobile;
}
