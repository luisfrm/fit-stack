import { platformPlansService } from "@/lib/services/platform-plans-service";
import { api } from "@/lib/api/client";
import { getExchangeRates } from "@/lib/api/exchange-rates";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { PlansClient } from "./plans-client";

export const dynamic = "force-dynamic";

export default async function PlatformPlansPage() {
  const [plans, summary, settings, rates] = await Promise.all([
    platformPlansService.getAllWithStats({
      next: { revalidate: 60, tags: ["console:plans"] },
    }),
    platformPlansService.getSummary({
      next: { revalidate: 300, tags: ["console:plans"] },
    }),
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
    getExchangeRates("USD").catch(() => null),
  ]);

  const primaryCurrency =
    settings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat =
    (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as "latam" | "usa") ||
    "latam";

  return (
    <PlansClient
      initialPlans={plans}
      initialSummary={summary}
      primaryCurrency={primaryCurrency}
      currencyFormat={currencyFormat}
      rates={rates}
    />
  );
}
