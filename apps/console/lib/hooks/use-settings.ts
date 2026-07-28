"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { toast } from "@workspace/ui";
import { useAuth } from "./use-auth";

export const SETTINGS_KEYS = {
  BRAND_PRIMARY: "brand_primary",
  ACTIVE_CURRENCIES: "active_currencies",
  PRIMARY_CURRENCY: "primary_currency",
  CURRENCY_FORMAT: "currency_format",
  ACTIVE_PAYMENT_METHODS: "active_payment_methods",
} as const;

const EMPTY_SETTINGS: Record<string, string> = {};

export function useSettings() {
  const queryClient = useQueryClient();
  const { activeOrganization } = useAuth();
  const activeOrganizationId = activeOrganization?.id;

  const query = useQuery({
    queryKey: ["settings", activeOrganizationId || "global"],
    queryFn: async () => {
      return await api<Record<string, string>>("/settings");
    },
    enabled: !!activeOrganizationId,
  });

  const updateMutation = useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      return await api("/settings", { method: "POST", body: settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Ajustes actualizados correctamente");
    },
    onError: (error: any) => {
      toast.error(error?.data?.error || "Error al actualizar los ajustes");
    },
  });

  return {
    settings: query.data || EMPTY_SETTINGS,
    isLoading: query.isLoading,
    isUpdating: updateMutation.isPending,
    updateSettings: updateMutation.mutateAsync,
  };
}
