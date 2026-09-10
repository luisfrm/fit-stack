"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Text } from "@workspace/ui/components";
import { Building2, Sparkles, BadgeCheck, BadgeX } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { OrgKpis } from "@/lib/platform/organization-selectors";

interface OrganizationsKpiSectionProps {
  readonly kpis: OrgKpis;
}

function KpiCard({
  label,
  value,
  icon,
  isActive,
  onClick,
  testId,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  isActive: boolean;
  onClick?: () => void;
  testId: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
        {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      <Text
        size="xs"
        variant="muted"
        className="uppercase tracking-widest font-bold mb-1"
      >
        {label}
      </Text>
      <Text size="lg" weight="bold" className="text-white tabular-nums">
        {value}
      </Text>
    </>
  );
  const className = cn(
    "text-left rounded-2xl border p-5",
    onClick
      ? "transition-all hover:border-primary/30 cursor-pointer"
      : "cursor-default",
    isActive
      ? "bg-primary/10 border-primary/30"
      : "bg-white/5 border-white/5 hover:bg-white/8",
  );
  if (!onClick) {
    return (
      <div data-testid={testId} className={className}>
        {body}
      </div>
    );
  }
  return (
    <button data-testid={testId} onClick={onClick} className={className}>
      {body}
    </button>
  );
}

export function OrganizationsKpiSection({
  kpis,
}: OrganizationsKpiSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSubStatus = searchParams.get("subStatus");

  const setSubStatus = (subStatus: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (subStatus) params.set("subStatus", subStatus);
    else params.delete("subStatus");
    params.set("page", "1");
    router.push(`/organizations?${params.toString()}`);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        label="Total clientes"
        value={kpis.total}
        icon={<Building2 className="w-4 h-4 text-primary" />}
        isActive={!activeSubStatus}
        onClick={() => setSubStatus(null)}
        testId="orgs-kpi-total"
      />
      <KpiCard
        label="Nuevas este mes"
        value={kpis.newThisMonth}
        icon={<Sparkles className="w-4 h-4 text-blue-400" />}
        isActive={false}
        testId="orgs-kpi-new"
      />
      <KpiCard
        label="Con sub activa"
        value={kpis.withActiveSub}
        icon={<BadgeCheck className="w-4 h-4 text-emerald-400" />}
        isActive={activeSubStatus === "active"}
        onClick={() =>
          setSubStatus(activeSubStatus === "active" ? null : "active")
        }
        testId="orgs-kpi-active"
      />
      <KpiCard
        label="Sin sub activa"
        value={kpis.withoutActiveSub}
        icon={<BadgeX className="w-4 h-4 text-orange-400" />}
        isActive={activeSubStatus === "none"}
        onClick={() => setSubStatus(activeSubStatus === "none" ? null : "none")}
        testId="orgs-kpi-none"
      />
    </div>
  );
}
