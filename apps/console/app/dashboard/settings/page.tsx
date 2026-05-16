import { redirect } from "next/navigation";

export default function PlatformSettingsPage() {
  redirect("/dashboard/settings/currencies");
}