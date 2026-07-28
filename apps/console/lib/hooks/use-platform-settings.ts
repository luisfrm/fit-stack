"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { toast } from "@workspace/ui";

export const PLATFORM_SETTINGS_KEYS = {
  ACTIVE_CURRENCIES: "active_currencies",
  PRIMARY_CURRENCY: "primary_currency",
  CURRENCY_FORMAT: "currency_format",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
} as const;

const EMPTY_SETTINGS: Record<string, string> = {};

export function usePlatformSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      return await api<Record<string, string>>("/platform/settings");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      return await api("/platform/settings", {
        method: "POST",
        body: settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success("Configuración actualizada correctamente");
    },
    onError: (error: any) => {
      toast.error(error?.data?.error || "Error al actualizar la configuración");
    },
  });

  return {
    settings: query.data || EMPTY_SETTINGS,
    isLoading: query.isLoading,
    isUpdating: updateMutation.isPending,
    updateSettings: updateMutation.mutateAsync,
  };
}
