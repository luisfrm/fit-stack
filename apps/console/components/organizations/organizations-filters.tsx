"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button, SimpleSelect } from "@workspace/ui/components";
import { COUNTRIES } from "@workspace/shared/constants";
import type { OrgSubStatusFilter } from "@/lib/platform/organization-selectors";

interface OrganizationsFiltersProps {
  readonly initialCountry: string | null;
  readonly initialSubStatus: OrgSubStatusFilter | null;
}

const SUB_STATUS_OPTIONS: { value: OrgSubStatusFilter; label: string }[] = [
  { value: "active", label: "Con sub activa" },
  { value: "none", label: "Sin sub activa" },
  { value: "past_due", label: "Vencidas" },
  { value: "read_only", label: "Solo lectura" },
  { value: "suspended", label: "Suspendidas" },
  { value: "cancelled", label: "Canceladas" },
];

export function OrganizationsFilters({
  initialCountry,
  initialSubStatus,
}: OrganizationsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const countryOptions = React.useMemo(
    () =>
      Object.entries(COUNTRIES).map(([code, config]) => ({
        value: code,
        label: config.name,
      })),
    [],
  );

  const setParam = (key: "country" | "subStatus", value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`/organizations?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-52">
        <SimpleSelect
          className="orgs-country-filter"
          value={initialCountry ?? ""}
          onChange={(value) => setParam("country", value || null)}
          options={countryOptions}
          placeholder="Todos los países"
        />
      </div>
      <div className="w-52">
        <SimpleSelect
          className="orgs-status-filter"
          value={initialSubStatus ?? ""}
          onChange={(value) => setParam("subStatus", value || null)}
          options={SUB_STATUS_OPTIONS}
          placeholder="Todos los estados"
        />
      </div>
      {(initialCountry || initialSubStatus) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("country");
            params.delete("subStatus");
            params.set("page", "1");
            router.push(`/organizations?${params.toString()}`);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
