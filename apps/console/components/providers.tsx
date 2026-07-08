"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeInjector } from "@/components/providers/theme-injector";
import { TooltipProvider } from "@workspace/ui/components";
import { useState } from "react";

export function Providers({ children }: { readonly children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeInjector />
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}