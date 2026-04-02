"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "@workspace/ui";

export const SETTINGS_KEYS = {
  GYM_NAME: "gym_name",
  GYM_SLOGAN: "gym_slogan",
  GYM_LOGO: "gym_logo_url",
  BRAND_PRIMARY: "brand_primary",
  TIMEZONE: "timezone"
} as const;

export function useSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, string>>("/settings");
      return response.data;
    },
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
    settings: query.data || {},
    isLoading: query.isLoading,
    isUpdating: updateMutation.isPending,
    updateSettings: updateMutation.mutateAsync,
  };
}
