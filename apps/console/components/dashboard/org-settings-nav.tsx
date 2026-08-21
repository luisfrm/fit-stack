"use client";

import * as React from "react";
import { Building2, Users } from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";

interface OrgSettingsNavProps {
  readonly organizationId: string;
}

export function OrgSettingsNav({ organizationId }: OrgSettingsNavProps) {
  const navItems = React.useMemo(() => [
    {
      label: "General",
      href: `/organizations/${organizationId}/settings`,
      icon: Building2,
    },
    {
      label: "Personal / Propietario",
      href: `/organizations/${organizationId}/settings/staff`,
      icon: Users,
    },
  ], [organizationId]);

  return (
    <NavTabs
      items={navItems}
      variant="glass"
      className="mb-8"
    />
  );
}
