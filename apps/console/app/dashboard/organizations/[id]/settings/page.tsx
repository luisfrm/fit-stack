"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { OrganizationSettingsForm } from "@/components/dashboard/organization-settings-form";
import { organizationsService } from "@/lib/services/organizations-service";
import { toast } from "@workspace/ui/components";
import type { IPlatformOrganization } from "@workspace/shared/types";

export default function OrganizationGeneralSettingsPage() {
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
        router.push("/dashboard/organizations");
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
      await organizationsService.update(id, {
        // @ts-ignore - Custom payload for updating settings
        settings: data,
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
    <div className="max-w-4xl space-y-8">
      <OrganizationSettingsForm
        initialData={(org as { settings?: Record<string, string> })?.settings ?? {}}
        onSave={handleSave}
        isLoading={isLoading}
        isUpdating={isUpdating}
        title={`General: ${org?.name || 'Cargando...'}`}
        description={`Configuración técnica y de marca para la sede ${org?.slug || ''}.`}
        backUrl="/dashboard/organizations"
      />
    </div>
  );
}