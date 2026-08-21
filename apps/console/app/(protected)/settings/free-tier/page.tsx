import { api } from "@/lib/api/client";
import { updateTag } from "next/cache";
import { featuresService } from "@/lib/services/features-service";
import { FEATURE_CATALOG } from "@workspace/shared";
import { FreeTierSettings } from "./free-tier-settings";

export const dynamic = "force-dynamic";

export default async function FreeTierSettingsPage() {
  const [settings, catalogData] = await Promise.all([
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
    featuresService.getCatalog({
      next: { revalidate: 3600, tags: ["console:settings"] },
    }),
  ]);

  const refreshSettings = async () => {
    "use server";
    updateTag("console:settings");
  };

  return (
    <FreeTierSettings
      initialSettings={settings}
      catalog={catalogData?.catalog ?? FEATURE_CATALOG}
      onSaved={refreshSettings}
    />
  );
}