"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { toast } from "@workspace/ui/components";
import { OrganizationStaffCard } from "@/components/dashboard/organization-staff-card";
import { organizationsService } from "@/lib/services/organizations-service";

export default function OrganizationStaffSettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [orgId, setOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function resolveOrg() {
      try {
        const org = await organizationsService.getBySlug(slug);
        setOrgId(org.id);
      } catch (error) {
        console.error("Error resolving organization by slug:", error);
        toast.error("No se pudo cargar la información de la organización");
      }
    }

    if (slug) {
      resolveOrg();
    }
  }, [slug]);

  return (
    <div className="max-w-4xl space-y-8">
      {orgId && <OrganizationStaffCard organizationId={orgId} />}
    </div>
  );
}
