"use client";

import { ThemeInjector } from "@/components/providers/theme-injector";
import { TooltipProvider } from "@workspace/ui/components";

export function Providers({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <ThemeInjector />
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </>
  );
}
