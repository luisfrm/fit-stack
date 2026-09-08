import { plansService } from "@/lib/services/plans-service";
import { MembershipsClient } from "./memberships-client";
import { settingsService } from "@/lib/services/settings-service";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { sessionService } from "@workspace/auth/service";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  const plansTag = `org:${activeOrgId}:plans`;
  const settingsTag = `org:${activeOrgId}:settings`;

  const [plans, summary, settings] = await Promise.all([
    plansService.getAll({ includeStats: true }, {
      next: { revalidate: 60, tags: [plansTag] },
    }),
    plansService.getSummary({
      next: { revalidate: 60, tags: [plansTag] },
    }),
    settingsService.getAll({
      next: { revalidate: 600, tags: [settingsTag] },
    }),
  ]);

  let activeCurrencies: string[] = [];
  const rawActive = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
  if (rawActive) {
    try {
      activeCurrencies = JSON.parse(rawActive);
    } catch {
      activeCurrencies = [];
    }
  }

  // Server action: purga el data cache de Next (tag org:{orgId}:plans) para que
  // router.refresh() tras crear/editar/eliminar un plan traiga datos frescos.
  const refreshPlans = async () => {
    "use server";
    updateTag(plansTag);
  };

  return (
    <MembershipsClient
      initialPlans={plans}
      initialSummary={summary}
      refreshPlans={refreshPlans}
      activeCurrencies={activeCurrencies}
      currencyFormat={
        (session?.activeOrganization?.currencyFormat as "latam" | "usa" | undefined) ?? "latam"
      }
    />
  );
}
