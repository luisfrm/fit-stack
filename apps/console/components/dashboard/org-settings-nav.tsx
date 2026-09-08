"use client";

import * as React from "react";
import { Building2, Users } from "lucide-react";
import { NavTabs } from "@workspace/ui/components/next/nav-tabs";

interface OrgSettingsNavProps {
  readonly organizationSlug: string;
}

export function OrgSettingsNav({ organizationSlug }: OrgSettingsNavProps) {
  const navItems = React.useMemo(() => [
    {
      label: "General",
      href: `/organizations/${organizationSlug}/settings`,
      icon: Building2,
    },
    {
      label: "Personal / Propietario",
      href: `/organizations/${organizationSlug}/settings/staff`,
      icon: Users,
    },
  ], [organizationSlug]);

  return (
    <NavTabs
      items={navItems}
      variant="glass"
      className="mb-8"
    />
  );
}
