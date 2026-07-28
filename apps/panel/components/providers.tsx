"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeInjector } from "@/components/providers/theme-injector";
import { TooltipProvider } from "@workspace/ui/components";
import { useState } from "react";

export function Providers({ children }: { readonly children: React.ReactNode }) {
  // Prevenir que el cliente se cree varias veces durante la hidratación
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutos por defecto (aumentado para mayor seguridad)
            refetchOnWindowFocus: false, // Evitar refrescos molestos al cambiar de pestaña
            refetchOnMount: false, // ¡IMPORTANTE! Evita que se dispare la petición al abrir el modal si ya hay datos
            retry: 1, // Reintentar una vez en caso de fallo
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
