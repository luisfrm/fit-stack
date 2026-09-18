import { api } from "@/lib/api/client";
import { updateTag } from "next/cache";
import { PlatformEmitterSettings } from "@/components/settings/emitter/emitter-settings";

export const dynamic = "force-dynamic";

export default async function PlatformEmitterPage() {
  const settings = await api<Record<string, string>>("/platform/settings", {
    next: { revalidate: 600, tags: ["console:settings"] },
  });

  const refreshSettings = async () => {
    "use server";
    updateTag("console:settings");
  };

  return (
    <PlatformEmitterSettings
      initialSettings={settings}
      onSaved={refreshSettings}
    />
  );
}
