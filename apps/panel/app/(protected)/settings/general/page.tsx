"use client";

import * as React from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { useOrgAuth } from "@workspace/auth/org";
import { OrganizationSettingsForm } from "@/components/dashboard/organization-settings-form";

export default function GeneralSettingsPage() {
  const { settings, isLoading: settingsLoading, isUpdating: settingsUpdating, updateSettings } = useSettings();
  const { isPending: sessionLoading } = useOrgAuth();

  const handleSave = async (data: Record<string, string>) => {
    await updateSettings(data);
  };

  const isLoading = settingsLoading || sessionLoading;

  return (
    <OrganizationSettingsForm
      initialData={settings}
      onSave={handleSave}
      isLoading={isLoading}
      isUpdating={settingsUpdating}
      title="Ajustes Generales"
      description="Configura la identidad y parámetros regionales de tu sede."
      backUrl="/dashboard"
    />
  );
}
