"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizationSettingsForm } from "@/components/dashboard/organization-settings-form";
import { organizationsService } from "@/lib/services/organizations-service";
import { toast } from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";

export default function OrganizationAdminSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [org, setOrg] = React.useState<IPlatformOrganization | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    async function fetchOrg() {
      try {
        const data = await organizationsService.getById(id);
        setOrg(data);
      } catch (error) {
        console.error("Error fetching organization:", error);
        toast.error("No se pudo cargar la información de la organización");
        router.push("/dashboard/platform/organizations");
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchOrg();
    }
  }, [id, router]);

  const handleSave = async (data: Record<string, string>) => {
    setIsUpdating(true);
    try {
      // Send settings inside the 'settings' property as expected by the new API route
      await organizationsService.update(id, {
        // @ts-ignore - The service expects IPlatformOrganization but we are sending a custom structure
        // that the PATCH handler in the API knows how to process (extracting 'settings')
        settings: data
      });
      toast.success("Ajustes de la organización actualizados");
    } catch (error) {
      console.error("Error updating organization settings:", error);
      toast.error("No se pudieron guardar los ajustes");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <OrganizationSettingsForm
      initialData={(org as any)?.settings || {}}
      onSave={handleSave}
      isLoading={isLoading}
      isUpdating={isUpdating}
      title={`Ajustes: ${org?.name || 'Cargando...'}`}
      description={`Configuración técnica y de marca para la sede ${org?.slug || ''}.`}
      backUrl="/dashboard/platform/organizations"
    />
  );
}
