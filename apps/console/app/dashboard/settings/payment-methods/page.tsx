import { api } from "@/lib/api/client";
import { updateTag } from "next/cache";
import { PlatformPaymentMethodsSettings } from "./payment-methods-settings";

export const dynamic = "force-dynamic";

export default async function PlatformPaymentMethodsPage() {
  const settings = await api<Record<string, string>>("/platform/settings", {
    next: { revalidate: 600, tags: ["console:settings"] },
  });

  const refreshSettings = async () => {
    "use server";
    updateTag("console:settings");
  };

  return (
    <PlatformPaymentMethodsSettings
      initialSettings={settings}
      onSaved={refreshSettings}
    />
  );
}
