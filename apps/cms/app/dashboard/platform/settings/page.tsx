import { redirect } from "next/navigation";

export default function PlatformSettingsPage() {
  redirect("/dashboard/platform/settings/currencies");
}