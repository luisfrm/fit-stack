"use client";

import { useBreakpoint } from "@workspace/ui/hooks/use-breakpoint";

/**
 * `true` when the viewport is smaller than the `md` breakpoint (< 768px).
 * Derived from the shared `useBreakpoint` hook (single source of truth for breakpoints).
 */
export function useIsMobile() {
  const { isMobile } = useBreakpoint();
  return isMobile;
}
