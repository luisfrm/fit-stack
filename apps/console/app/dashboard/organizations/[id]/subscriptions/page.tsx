"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { useQuery } from "@tanstack/react-query";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";
import { type CurrencyFormat } from "@/lib/utils/value-converters";

export default function OrganizationSubscriptionsPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.id as string;

  const [page, setPage] = React.useState(1);
  const limit = 15;

  const { settings } = usePlatformSettings();
  const currencyFormat = (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const { data: subsResult, isLoading } = useQuery({
    queryKey: ["platform-subscriptions", { page, organizationId }],
    queryFn: () => platformSubscriptionsService.getAll({
      page,
      limit,
      organizationId,
    }),
  });

  const organizationName = subsResult?.data?.[0]?.organizationName || "Organización";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/subscriptions")}
          className="gap-2 text-foreground/60 hover:text-foreground font-bold uppercase tracking-wider"
        >
          <ChevronLeft className="size-4" />
          Suscripciones SaaS
        </Button>
      </div>

      <DashboardHeader
        title={organizationName}
        description={`Suscripciones activas de esta organización en Fit-Stack.`}
        iconName="Building2"
      />

      <SubscriptionsTable
        subscriptions={subsResult?.data || []}
        loading={isLoading}
        currencyFormat={currencyFormat}
        pagination={{
          page,
          totalPages: subsResult?.totalPages || 1,
          total: subsResult?.total || 0,
          limit,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}