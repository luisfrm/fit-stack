"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@workspace/ui";
import { useAuth } from "./use-auth";

export const SETTINGS_KEYS = {
  BRAND_PRIMARY: "brand_primary",
  ACTIVE_CURRENCIES: "active_currencies",
  PRIMARY_CURRENCY: "primary_currency",
  CURRENCY_FORMAT: "currency_format",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
  THEME_MODE: "theme_mode",
} as const;

const EMPTY_SETTINGS: Record<string, string> = {};

export function useSettings() {
  const queryClient = useQueryClient();
  const { activeOrganization } = useAuth();
  const activeOrganizationId = activeOrganization?.id;

  const query = useQuery({
    queryKey: ["settings", activeOrganizationId || "global"],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, string>>("/settings");
      return response.data;
    },
    enabled: !!activeOrganizationId,
  });

  const updateMutation = useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      const response = await apiClient.post("/settings", settings);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Ajustes actualizados correctamente");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Error al actualizar los ajustes");
    },
  });

  return {
    settings: query.data || EMPTY_SETTINGS,
    isLoading: query.isLoading,
    isUpdating: updateMutation.isPending,
    updateSettings: updateMutation.mutateAsync,
  };
}
