import { api } from "@/lib/api/client";
import { updateTag } from "next/cache";
import { PlatformGeneralSettings } from "./general-settings";

export const dynamic = "force-dynamic";

export default async function PlatformGeneralPage() {
  const settings = await api<Record<string, string>>("/platform/settings", {
    next: { revalidate: 600, tags: ["console:settings"] },
  });

  const refreshSettings = async () => {
    "use server";
    updateTag("console:settings");
  };

  return (
    <PlatformGeneralSettings
      initialSettings={settings}
      onSaved={refreshSettings}
    />
  );
}