"use client";

import { OrgContextGuard } from "@workspace/ui/components/org-context-guard";
import { ThemeInjector } from "@/components/providers/theme-injector";
import { TooltipProvider } from "@workspace/ui/components";

export function Providers({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <OrgContextGuard />
      <ThemeInjector />
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </>
  );
}
