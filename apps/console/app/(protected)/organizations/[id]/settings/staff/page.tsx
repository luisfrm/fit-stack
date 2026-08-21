"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { OrganizationStaffCard } from "@/components/dashboard/organization-staff-card";

export default function OrganizationStaffSettingsPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="max-w-4xl space-y-8">
      {id && <OrganizationStaffCard organizationId={id} />}
    </div>
  );
}
