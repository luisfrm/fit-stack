"use client";

import { DashboardHeader as DashboardHeaderBase } from "@workspace/ui/components";

type DashboardHeaderProps = React.ComponentProps<typeof DashboardHeaderBase>;

export function DashboardHeader(props: DashboardHeaderProps) {
  return <DashboardHeaderBase {...props} />;
}
