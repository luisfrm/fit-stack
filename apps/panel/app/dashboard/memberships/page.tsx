import { plansService } from "@/lib/services/plans-service";
import { MembershipsClient } from "./memberships-client";
import { updateTag } from "next/cache";
import { settingsService } from "@/lib/services/settings-service";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import { sessionService } from "@workspace/auth/service";

export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  const { data: session } = await sessionService.getSession();
  const timezone =
    session?.session?.activeOrganizationId
      ? (await settingsService.getByKey("org_timezone")) || DEFAULT_TIMEZONE
      : DEFAULT_TIMEZONE;
  void timezone;

  const [plans, summary, settings] = await Promise.all([
    plansService.getAll({ includeStats: true }, {
      next: { revalidate: 60, tags: ["panel:plans"] },
    }),
    plansService.getSummary({
      next: { revalidate: 60, tags: ["panel:plans"] },
    }),
    settingsService.getAll({
      next: { revalidate: 600, tags: ["panel:settings"] },
    }),
  ]);

  const refreshPlans = async () => {
    "use server";
    updateTag("panel:plans");
  };
  void refreshPlans;

  let activeCurrencies: string[] = ["USD"];
  const rawActive = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
  if (rawActive) {
    try {
      activeCurrencies = JSON.parse(rawActive);
    } catch {
      activeCurrencies = ["USD"];
    }
  }

  return (
    <MembershipsClient
      initialPlans={plans}
      initialSummary={summary}
      activeCurrencies={activeCurrencies}
      currencyFormat={
        (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as "latam" | "usa") ||
        "latam"
      }
    />
  );
}
