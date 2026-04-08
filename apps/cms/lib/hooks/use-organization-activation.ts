"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@workspace/ui/components";
import { sessionService } from "@/lib/services/session-service";
import { organizationsService } from "@/lib/services/organizations-service";

/**
 * Hook to handle "Smart" organization activation logic.
 * Encapsulates context switching, platform-admin auto-join, notifications and routing.
 */
export function useOrganizationActivation() {
  const [isActivating, setIsActivating] = React.useState(false);
  const router = useRouter();

  const activate = async (organizationId: string) => {
    setIsActivating(true);
    try {
      let { error } = await sessionService.setActiveOrganization(organizationId);

      // Auto-join if user is a global admin but not a member of this specific organization
      if (error?.code === "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION") {
        toast.info("Vinculando perfil de administrador...");
        try {
          await organizationsService.join(organizationId);
          // Retry activation after successful join
          const retry = await sessionService.setActiveOrganization(organizationId);
          error = retry.error;
        } catch (joinErr: any) {
          console.error("Failed to auto-join organization:", joinErr);
          error = { message: "No se pudo vincular automáticamente al gimnasio." };
        }
      }

      if (error) {
        toast.error(error.message || "Error al cambiar de organización");
        console.error("Error activating organization:", error);
        return false;
      }

      toast.success("Contexto activado correctamente");
      router.refresh();
      return true;
    } catch (err: any) {
      console.error("Error activating organization hook:", err);
      toast.error("Error crítico al establecer contexto");
      return false;
    } finally {
      setIsActivating(false);
    }
  };

  return {
    activate,
    isActivating,
  };
}
